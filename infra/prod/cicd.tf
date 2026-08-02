# cicd.tf
# Day 38: GitHub Actions から AWS へ OIDC で認証するための OIDC プロバイダと
# デプロイ用 IAM ロールを定義する。長期アクセスキーを GitHub に置かずに済む。

# GitHub Actions の OIDC プロバイダ。
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # GitHub OIDC の証明書サムプリント(AWS 側でも検証されるため固定値で可)。
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# GitHub Actions(指定リポジトリ)が assume するデプロイロール。
data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # 信頼を指定リポジトリの main ブランチのワークフローのみに絞る。
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name_prefix        = "${local.name_prefix}-gh-deploy-"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
}

# ECR への push と App Runner デプロイ起動のみを許可(最小権限)。
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repo in aws_ecr_repository.this : repo.arn]
  }

  # ListOperations は deploy.yml がデプロイ完了を待つために使う。
  # DescribeService は「現在の SourceConfiguration を取得して ImageIdentifier だけ
  # 差し替える」ために使う(UpdateService は設定を置き換えるため、env / secrets /
  # アクセスロールを保つには現設定の取得が必須)。
  statement {
    sid = "AppRunnerDeploy"
    actions = [
      "apprunner:StartDeployment",
      "apprunner:UpdateService",
      "apprunner:DescribeService",
      "apprunner:ListServices",
      "apprunner:ListOperations",
    ]
    resources = ["*"]
  }

  # UpdateService に AuthenticationConfiguration.AccessRoleArn を含めて渡すため、
  # 対象ロールの PassRole が必要になる。
  #
  # `iam:PassedToService` による条件は付けない。App Runner の UpdateService は
  # このコンテキストキーを設定しないらしく、条件付きだとステートメント自体が
  # 適用されず AccessDeniedException になる(2026-08-02 に実測)。
  #   User: .../GitHubActions is not authorized to perform: iam:PassRole
  #   because no identity-based policy allows the iam:PassRole action
  # 代わりに resources を App Runner の 2 ロールに限定して影響範囲を絞る。
  statement {
    sid       = "PassAppRunnerRoles"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.apprunner_access.arn, aws_iam_role.apprunner_instance.arn]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
