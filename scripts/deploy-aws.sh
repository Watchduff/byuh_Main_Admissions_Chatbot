#!/usr/bin/env bash
#
# deploy-aws.sh — one-shot AWS deployment for the BYU-H admissions bot.
#
#   Usage: scripts/deploy-aws.sh <path-to-project-dir>
#
# Prerequisites on the machine running this script:
#   - aws CLI, authenticated (`aws sts get-caller-identity` must succeed)
#   - docker (running)
#   - node + pnpm (used to run migrations + ingestion against the new RDS)
#   - jq, curl
#
# What this provisions in your AWS account (idempotent; resource IDs stored in
# <project>/.aws-deploy.state so re-runs resume):
#   - RDS Postgres 16 instance with pgvector (publicly reachable, SSL-required)
#   - ECR repository + pushed Docker image built from the project
#   - App Runner service running the image, wired to RDS + .env secrets
#
# Security note: RDS is created publicly accessible with a SG open on 5432 so
# that both your machine (for migrations/ingestion) and App Runner's dynamic
# egress can reach it. Access is gated by a strong generated password and TLS
# (sslmode=require). For hardened setups, switch to a VPC connector + private
# RDS after the first deploy — see README.

set -euo pipefail

########################################
# Args + config
########################################

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

PROJECT_DIR="$(cd "$1" && pwd)"
cd "$PROJECT_DIR"

APP_NAME="${APP_NAME:-byuh-admissions}"
AWS_REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo us-east-1)}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t4g.micro}"
DB_ALLOCATED_STORAGE="${DB_ALLOCATED_STORAGE:-20}"
DB_ENGINE_VERSION="${DB_ENGINE_VERSION:-16.4}"
APP_RUNNER_CPU="${APP_RUNNER_CPU:-1024}"
APP_RUNNER_MEMORY="${APP_RUNNER_MEMORY:-2048}"

STATE_FILE="$PROJECT_DIR/.aws-deploy.state"

########################################
# Logging helpers
########################################

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

########################################
# State file (simple KEY=VALUE store)
########################################

state_get() {
  [[ -f "$STATE_FILE" ]] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" | tail -1
}
state_set() {
  local key="$1" val="$2"
  touch "$STATE_FILE"
  if grep -q "^$key=" "$STATE_FILE" 2>/dev/null; then
    # portable in-place edit (macOS + Linux)
    sed -i.bak "s|^$key=.*|$key=$val|" "$STATE_FILE" && rm -f "$STATE_FILE.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$STATE_FILE"
  fi
}

########################################
# Prereq checks
########################################

need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

for t in aws docker jq curl node pnpm; do need "$t"; done

if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
  die "AWS CLI not authenticated. Run 'aws configure' or 'aws sso login' first."
fi

if ! docker info >/dev/null 2>&1; then
  die "docker daemon is not reachable. Start Docker Desktop / docker engine."
fi

[[ -f "$PROJECT_DIR/.env" ]] || die ".env not found in $PROJECT_DIR"

# Read app secrets from project .env — these get injected into App Runner.
OPENAI_API_KEY="$(grep -E '^OPENAI_API_KEY=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' )"
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' )"
[[ -n "$OPENAI_API_KEY" ]] || die "OPENAI_API_KEY missing from .env"
[[ -n "$CRON_SECRET" ]]        || die "CRON_SECRET missing from .env"

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
log "AWS account: $AWS_ACCOUNT_ID   region: $AWS_REGION   app: $APP_NAME"

########################################
# Network: default VPC + subnets
########################################

VPC_ID="$(aws ec2 describe-vpcs --region "$AWS_REGION" \
  --filters 'Name=isDefault,Values=true' \
  --query 'Vpcs[0].VpcId' --output text)"
[[ "$VPC_ID" != "None" && -n "$VPC_ID" ]] || die "no default VPC in $AWS_REGION. Set one up or re-run in a region that has one."

SUBNET_IDS=$(aws ec2 describe-subnets --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --query 'Subnets[].SubnetId' --output text)
[[ -n "$SUBNET_IDS" ]] || die "no default subnets found in VPC $VPC_ID"

########################################
# RDS security group
########################################

DB_SG_NAME="${APP_NAME}-db-sg"
DB_SG_ID="$(aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters "Name=group-name,Values=$DB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)"

if [[ "$DB_SG_ID" == "None" || -z "$DB_SG_ID" ]]; then
  log "creating security group $DB_SG_NAME"
  DB_SG_ID="$(aws ec2 create-security-group --region "$AWS_REGION" \
    --group-name "$DB_SG_NAME" \
    --description "Ingress for $APP_NAME RDS" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)"
  aws ec2 authorize-security-group-ingress --region "$AWS_REGION" \
    --group-id "$DB_SG_ID" --protocol tcp --port 5432 --cidr 0.0.0.0/0 \
    >/dev/null
fi
state_set DB_SG_ID "$DB_SG_ID"
log "RDS security group: $DB_SG_ID"

########################################
# DB subnet group
########################################

DB_SUBNET_GROUP="${APP_NAME}-dbsubnets"
if ! aws rds describe-db-subnet-groups --region "$AWS_REGION" \
      --db-subnet-group-name "$DB_SUBNET_GROUP" >/dev/null 2>&1; then
  log "creating db subnet group $DB_SUBNET_GROUP"
  # shellcheck disable=SC2086
  aws rds create-db-subnet-group --region "$AWS_REGION" \
    --db-subnet-group-name "$DB_SUBNET_GROUP" \
    --db-subnet-group-description "subnets for $APP_NAME" \
    --subnet-ids $SUBNET_IDS >/dev/null
fi

########################################
# RDS Postgres instance
########################################

DB_INSTANCE_ID="${APP_NAME}-db"
DB_NAME="byuh_admissions"
DB_USER="byuhadmin"

DB_PASSWORD="$(state_get DB_PASSWORD || true)"
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/')"
  state_set DB_PASSWORD "$DB_PASSWORD"
fi

if ! aws rds describe-db-instances --region "$AWS_REGION" \
      --db-instance-identifier "$DB_INSTANCE_ID" >/dev/null 2>&1; then
  log "creating RDS instance $DB_INSTANCE_ID (this takes 5-10 min)"
  aws rds create-db-instance --region "$AWS_REGION" \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine postgres \
    --engine-version "$DB_ENGINE_VERSION" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage "$DB_ALLOCATED_STORAGE" \
    --storage-type gp3 \
    --db-name "$DB_NAME" \
    --vpc-security-group-ids "$DB_SG_ID" \
    --db-subnet-group-name "$DB_SUBNET_GROUP" \
    --publicly-accessible \
    --backup-retention-period 1 \
    --no-deletion-protection \
    --no-multi-az \
    --no-auto-minor-version-upgrade \
    >/dev/null
else
  log "RDS instance $DB_INSTANCE_ID already exists"
fi

log "waiting for RDS to become available…"
aws rds wait db-instance-available --region "$AWS_REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID"

DB_HOST="$(aws rds describe-db-instances --region "$AWS_REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
DB_PORT="$(aws rds describe-db-instances --region "$AWS_REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query 'DBInstances[0].Endpoint.Port' --output text)"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
state_set DATABASE_URL "$DATABASE_URL"
log "RDS endpoint: $DB_HOST:$DB_PORT"

########################################
# Run migrations + ingestion locally against RDS
########################################

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  log "installing node deps"
  (cd "$PROJECT_DIR" && pnpm install --frozen-lockfile)
fi

log "running database migrations"
(cd "$PROJECT_DIR" && DATABASE_URL="$DATABASE_URL" pnpm db:migrate)

if [[ "${SKIP_INGEST:-0}" != "1" ]]; then
  log "running ingestion (set SKIP_INGEST=1 to skip)"
  (cd "$PROJECT_DIR" && \
    DATABASE_URL="$DATABASE_URL" \
    OPENAI_API_KEY="$OPENAI_API_KEY" \
    pnpm ingest)
else
  log "skipping ingestion"
fi

########################################
# ECR repo + image build/push
########################################

ECR_REPO="$APP_NAME"
if ! aws ecr describe-repositories --region "$AWS_REGION" \
      --repository-names "$ECR_REPO" >/dev/null 2>&1; then
  log "creating ECR repo $ECR_REPO"
  aws ecr create-repository --region "$AWS_REGION" \
    --repository-name "$ECR_REPO" \
    --image-scanning-configuration scanOnPush=true >/dev/null
fi

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_TAG="$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
FULL_IMAGE="${ECR_URI}:${IMAGE_TAG}"

log "ECR login"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >/dev/null

log "building image $FULL_IMAGE"
docker build --platform linux/amd64 -t "$FULL_IMAGE" -t "${ECR_URI}:latest" "$PROJECT_DIR"

log "pushing image"
docker push "$FULL_IMAGE"
docker push "${ECR_URI}:latest"
state_set IMAGE "$FULL_IMAGE"

########################################
# App Runner ECR access role
########################################

ACCESS_ROLE_NAME="${APP_NAME}-apprunner-ecr"
if ! aws iam get-role --role-name "$ACCESS_ROLE_NAME" >/dev/null 2>&1; then
  log "creating IAM role $ACCESS_ROLE_NAME for App Runner ECR pulls"
  TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam create-role --role-name "$ACCESS_ROLE_NAME" \
    --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy --role-name "$ACCESS_ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
  # IAM role propagation can take several seconds
  sleep 10
fi
ACCESS_ROLE_ARN="$(aws iam get-role --role-name "$ACCESS_ROLE_NAME" --query 'Role.Arn' --output text)"

########################################
# App Runner service
########################################

SERVICE_NAME="$APP_NAME"
SERVICE_ARN="$(aws apprunner list-services --region "$AWS_REGION" \
  --query "ServiceSummaryList[?ServiceName=='${SERVICE_NAME}'].ServiceArn | [0]" \
  --output text 2>/dev/null || echo None)"

SOURCE_CONFIG=$(jq -n \
  --arg image "$FULL_IMAGE" \
  --arg role "$ACCESS_ROLE_ARN" \
  --arg db "$DATABASE_URL" \
  --arg oak "$OPENAI_API_KEY" \
  --arg cs "$CRON_SECRET" \
  '{
    AuthenticationConfiguration: { AccessRoleArn: $role },
    AutoDeploymentsEnabled: false,
    ImageRepository: {
      ImageIdentifier: $image,
      ImageRepositoryType: "ECR",
      ImageConfiguration: {
        Port: "3000",
        RuntimeEnvironmentVariables: {
          NODE_ENV: "production",
          DATABASE_URL: $db,
          OPENAI_API_KEY: $oak,
          CRON_SECRET: $cs
        }
      }
    }
  }')

INSTANCE_CONFIG=$(jq -n \
  --arg cpu "$APP_RUNNER_CPU" \
  --arg mem "$APP_RUNNER_MEMORY" \
  '{ Cpu: $cpu, Memory: $mem }')

HEALTH_CONFIG='{"Protocol":"TCP","Timeout":10,"Interval":10,"HealthyThreshold":1,"UnhealthyThreshold":5}'

if [[ "$SERVICE_ARN" == "None" || -z "$SERVICE_ARN" ]]; then
  log "creating App Runner service $SERVICE_NAME"
  SERVICE_ARN="$(aws apprunner create-service --region "$AWS_REGION" \
    --service-name "$SERVICE_NAME" \
    --source-configuration "$SOURCE_CONFIG" \
    --instance-configuration "$INSTANCE_CONFIG" \
    --health-check-configuration "$HEALTH_CONFIG" \
    --query 'Service.ServiceArn' --output text)"
else
  log "updating App Runner service $SERVICE_NAME"
  aws apprunner update-service --region "$AWS_REGION" \
    --service-arn "$SERVICE_ARN" \
    --source-configuration "$SOURCE_CONFIG" \
    --instance-configuration "$INSTANCE_CONFIG" \
    --health-check-configuration "$HEALTH_CONFIG" >/dev/null
fi
state_set SERVICE_ARN "$SERVICE_ARN"

log "waiting for App Runner service to reach RUNNING (this can take a few minutes)…"
while :; do
  STATUS="$(aws apprunner describe-service --region "$AWS_REGION" \
    --service-arn "$SERVICE_ARN" --query 'Service.Status' --output text)"
  case "$STATUS" in
    RUNNING) break ;;
    CREATE_FAILED|DELETED|PAUSED|OPERATION_IN_PROGRESS|DELETE_FAILED)
      if [[ "$STATUS" == "OPERATION_IN_PROGRESS" ]]; then
        printf '.'; sleep 15; continue
      fi
      die "App Runner service ended in status: $STATUS"
      ;;
    *) printf '.'; sleep 15 ;;
  esac
done
echo

SERVICE_URL="$(aws apprunner describe-service --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" --query 'Service.ServiceUrl' --output text)"

cat <<EOF

$(printf '\033[1;32m✓ deploy complete\033[0m')

  App URL:       https://$SERVICE_URL
  RDS endpoint:  $DB_HOST:$DB_PORT
  Image:         $FULL_IMAGE
  State file:    $STATE_FILE   (contains DATABASE_URL + DB password — keep secret)

Re-run this script anytime to roll forward with a new image. Set SKIP_INGEST=1
to skip re-ingestion on subsequent runs.
EOF
