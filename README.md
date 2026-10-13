# handicraft 山添

Cloudflare Pagesで配信するショップと、D1に接続する管理画面です。Pages FunctionsのAdvanced modeを使い、既存のWorker APIを `dist/_worker.js` としてビルドします。

参考: [Pages Functions Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) · [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/) · [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/) · [Google in Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) · [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

## ローカルで確認

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

ショップは `http://localhost:8000/`、管理画面は `http://localhost:8000/admin` です。`npm run build:pages` は `public/` の静的ファイルと `src/index.js` をPages Advanced mode用の `dist/` に出力します。ローカル開発では `.dev.vars` に指定した開発用メールアドレスで管理画面を確認できます。このローカル認証は `ENVIRONMENT=development` の場合だけ有効で、本番環境には設定しないでください。

## Cloudflare Pagesの設定

1. Cloudflare Dashboardで **Workers & Pages > Create application > Pages > Connect to Git** を選び、GitHubの `su-chanpo/penguin-gray` リポジトリと `main` ブランチを接続します。プロジェクト名は `handicraft-yamazoe` にします。
2. Framework presetは **None**、Build commandは `npm run build:pages`、Build output directoryは `dist`、Root directoryは `/` にします。`wrangler.jsonc` の `pages_build_output_dir` とD1 bindingをPages設定のソースとして使います。
3. このリポジトリには既存のD1 `handicraft-store` のDatabase IDを設定済みです。初めて別のCloudflareアカウントで使う場合だけ `npx wrangler d1 create handicraft-store` を実行し、そのDatabase IDを `wrangler.jsonc` に設定してください。`npm run db:migrate:remote` でテーブルとサンプル商品を作成します。
4. PagesプロジェクトのProduction environmentに次の変数を設定します。Preview deploymentsを使う場合はPreview environmentにも必要なAccess設定を追加してください。
   - `ENVIRONMENT`: `production`
   - `ACCESS_TEAM_DOMAIN`: Zero Trustのチームドメイン（例: `example.cloudflareaccess.com`）
   - `ACCESS_AUD`: 管理用Cloudflare AccessアプリケーションのAudience Tag。複数ある場合はカンマ区切り。
   - `BOOTSTRAP_ADMIN_EMAILS`: 初期管理者にするGoogleアカウント。複数ある場合はカンマ区切り。初期管理者は管理画面から削除できません。
   PagesのProject settings内のEnvironment variables and secretsに、Bootstrap administratorのメールアドレスを設定します。値はこのリポジトリに書かないでください。
5. Google Cloud ConsoleでOAuth同意画面とWeb applicationのOAuthクライアントを作成します。承認済みJavaScript生成元は `https://<team-name>.cloudflareaccess.com`、リダイレクトURIは `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback` です。
6. Cloudflare Zero Trustの **Integrations > Identity providers** でGoogleを追加し、GoogleのClient IDとClient Secretを保存します。Client SecretはCloudflareにだけ登録してください。
7. Pagesプロジェクトの `handicraft-yamazoe.pages.dev` の `/admin*` と `/api/admin/*` をCloudflare Accessで保護します。ポリシーはGoogleログインを必須にし、Googleアカウントをメールアドレスで個別制限しないでください。実際の管理権限はWorker APIがD1の管理者一覧で検証します。別々のAccessアプリケーションにする場合は、両方のAudience Tagを `ACCESS_AUD` にカンマ区切りで設定してください。
8. GitHubの `main` ブランチへpushするとPagesが自動でビルド・デプロイします。手動でデプロイする場合は `npm run deploy` を実行します。

本番公開には、Pagesプロジェクトの作成、Access/Google OAuth設定、および `BOOTSTRAP_ADMIN_EMAILS` の設定が必要です。これらの認証情報はこのリポジトリに含めません。

## 管理とお問い合わせ

- 商品、公開状態、表示順、掲載写真、サンプル表示を管理できます。初期登録の商品・価格はサンプルです。
- 店舗情報やサイトのお知らせを変更できます。
- 初期管理者はPagesの環境変数で指定し、追加管理者の登録・再有効化・停止は管理画面から行います。初期管理者は誤操作防止のため画面から停止できません。
- 管理画面は公開トップページからリンクせず、HTML/CSS/JavaScriptもAccess JWTまたはローカル開発認証を確認してから配信します。
- AccessポリシーはGoogleログインを要求し、個々のメールアドレスによる制限はしません。ログイン後の管理者権限はD1で確認するため、追加したアカウントはAccessポリシーの変更なしで利用できます。
- ショップのフォームは、名前・連絡先・問い合わせ内容を保存する**在庫確認の問い合わせ**です。決済、配送先、カード情報は扱わず、注文や購入を確定しません。
- 問い合わせは対応状況を更新でき、削除すると連絡先などの保存データも削除されます。
- 管理APIはCloudflare AccessのJWT署名、Audience、発行元、有効期限に加え、初期管理者またはD1の有効な管理者一覧を検証します。
