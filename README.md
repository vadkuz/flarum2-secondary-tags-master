# Secondary Tags Master (Flarum 2)

Features:
- Bind global secondary tags to selected primary tags (or keep them global).
- For secondary tags, show a clear checkbox to control visibility in **All Discussions**.

Install:
```bash
composer require vadkuz/flarum2-secondary-tags-master
php flarum cache:clear
php flarum assets:publish
```

Usage (Admin):
- Go to **Admin Panel -> Tags**.
- Edit a secondary tag (one without a parent) and pick allowed primary tags.
- If no primary tags are selected, the secondary tag remains global (works like default Flarum).

