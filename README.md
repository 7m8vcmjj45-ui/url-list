# MyList (`url-list`)

iPhone Safariの共有シートから、開いているページを「共有 → MyListに追加」の2タップでSupabaseへ保存する個人用URLリストです。

- Web: HTML / CSS / JavaScriptのみ
- 保存先: Supabase Database + Data REST API
- 追加: iPhoneショートカットからSupabaseへ直接POST
- 一覧・削除・サイト別ソート: ホーム画面に追加したWebサイトから操作
- 動画: ページタイトルから作品タイトルと出演者名を分けて表示
- 漫画: 話数やサイト名を除き、作品名を表示
- Flask、専用サーバー、App Storeアプリは不要

## 構成

```text
index.html               Web画面
styles.css               iPhone向け表示
app.js                   一覧取得・削除・端末内の接続設定
manifest.webmanifest     ホーム画面表示用
supabase/schema.sql      テーブルと3つのAPI関数
```

## セキュリティ設計

Supabaseの **Publishable key** はWebページで使うことを前提とした公開可能なキーです。一方、データを分ける **リストキー** は公開せず、Webでは端末のブラウザ内、iPhoneではショートカット内だけに保存します。

`links` テーブルへの直接アクセス権は `anon` から外しています。Webとショートカットが呼べるのは、次の3関数だけです。

- `save_link`: リストキーが一致するリストへ保存。同じURLは重複させず、タイトルだけ更新
- `get_links`: リストキーが一致するURLだけを新しい順に返す
- `delete_link`: リストキーとURLのIDが両方一致するときだけ削除

データベースにはリストキー自体ではなく、SHA-256ハッシュだけを保存します。`service_role` / Secret key はWebやショートカットで絶対に使わないでください。

## 一覧の表示ルール

一覧上部の **並び順** から切り替えられます。

- **新しい順**: 保存日時が新しいものから表示
- **サイト別**: ドメイン名でまとめ、同じサイト内は新しい順で表示

保存時のページタイトルとURLから、表示内容を次のように整理します。

- 動画ページ: `YouTube` などのサイト名をタイトル末尾から除去
- 動画タイトル内の `出演:`、`出演者:`、`キャスト:`、`主演:` に続く文字を出演者として別表示
- 漫画ページ: 先頭・末尾の `第12話`、`3巻`、`Chapter 4` などを除き、作品名を表示
- 通常ページ: サイト名だけを除いたページタイトルを表示

これはページタイトルを使う簡易抽出です。出演者名がページタイトルに書かれていない場合は、出演欄を表示しません。サイト固有のタイトル形式に合わせたい場合は、`app.js` の `detectContentKind`、`extractPerformers`、`extractComicTitle` を調整します。

## 1. Supabaseを準備する

1. Supabaseで新しいProjectを作ります。
2. 左メニューの **SQL Editor** を開きます。
3. `supabase/schema.sql` の全内容を貼り付け、**Run** を押します。
4. Projectの **Connect**（または **Integrations → Data API**）から次を控えます。
   - Project URL: `https://xxxxxxxx.supabase.co`
   - Publishable key: `sb_publishable_...`

旧プロジェクトでPublishable keyがない場合は、Legacy API Keysの `anon` keyでも動きます。Secret keyと旧 `service_role` keyは使いません。

## 2. Webサイトを初回設定する

サイトを開くと接続設定が表示されます。

1. Project URLを入力します。
2. Publishable keyを入力します。
3. **新しいキーを生成** を押します。
4. **キーをコピー** を押し、安全な場所へ控えます。
5. **保存して接続** を押します。

リストキーを紛失すると、保存済みURLへアクセスできなくなります。GitHub、スクリーンショット、SNSなどへ公開しないでください。

## 3. iPhoneショートカット「MyListに追加」を作る

ショートカットの利用時は2タップですが、最初に以下の設定を1回だけ行います。

### 共有シートの設定

1. iPhoneの **ショートカット** アプリで新規ショートカットを作り、名前を `MyListに追加` にします。
2. ショートカットの詳細を開き、**共有シートに表示** をオンにします。
3. 受け取る入力タイプは **SafariのWebページ** だけにします。

### HTTPリクエストの設定

アクション **URLの内容を取得** を1つ追加し、次のように設定します。

| 項目 | 値 |
|---|---|
| URL | `https://PROJECT_REF.supabase.co/rest/v1/rpc/save_link` |
| メソッド | `POST` |
| ヘッダ `apikey` | SupabaseのPublishable key |
| リクエスト本文 | `JSON` |
| `p_list_key` | Web初回設定で生成したリストキー |
| `p_url` | `ショートカットの入力` の詳細を **URL** にしたマジック変数 |
| `p_title` | `ショートカットの入力` の詳細を **名前** にしたマジック変数 |

`PROJECT_REF` はProject URLのサブドメイン部分です。Project URLが `https://abc123.supabase.co` なら、完全なURLは `https://abc123.supabase.co/rest/v1/rpc/save_link` です。

「名前」を選べない場合は、先に **Safari Webページの詳細を取得** アクションを追加し、詳細を **名前** にして、その出力を `p_title` に指定してください。タイトル保存が不要なら `p_title` の行自体を省略しても保存できます。

最後に **通知を表示** アクションを追加し、本文を `MyListに保存しました` にすると成功が分かりやすくなります。初回実行時だけ、ショートカットからSupabaseへの通信許可を求められる場合があります。

### 実際の使い方

```text
Safariでページを開く
→ 共有ボタン
→ MyListに追加
→ バックグラウンドでSupabaseへ保存
```

共有シート最下部の **アクションを編集** で `MyListに追加` をお気に入りへ入れると、常に上の方へ表示できます。

## 4. GitHub Pagesで公開する

GitHubの `url-list` リポジトリへこれらのファイルを置いた後、リポジトリの **Settings → Pages** を開きます。**Deploy from a branch** を選び、対象ブランチの `/ (root)` を公開元にします。

公開URLをiPhone Safariで開き、共有メニューから **ホーム画面に追加** を選ぶと、MyListをアプリのように起動できます。

## 任意: パソコンで表示を確認する

リポジトリのフォルダで次を実行します。

```sh
python3 -m http.server 8000
```

- `python3`: Python 3を起動します。
- `-m http.server`: Python付属の簡易Webサーバー機能を実行します。
- `8000`: `http://localhost:8000` で待ち受けるポート番号です。

これは表示確認専用です。保存処理はSupabaseへ送るため、FlaskなどのローカルAPIサーバーは不要です。

## トラブルシュート

- **`permission denied for function ...`**: `schema.sql` を最後まで実行したか確認します。
- **`Failed to fetch`**: Project URL、Publishable key、通信状態を確認します。
- **一覧が0件のまま**: Web設定とショートカットの `p_list_key` が完全に同じか確認します。
- **401 Unauthorized**: Publishable keyを `apikey` ヘッダへ入れたか確認します。新しい `sb_publishable_...` を `Authorization: Bearer ...` に入れないでください。
- **ショートカットが共有に出ない**: 「共有シートに表示」がオンで、入力タイプが「SafariのWebページ」になっているか確認します。
