# DA Works — دسکتاپ و Android

DA Works فضای شخصی برای ثبت ایده‌ها، پروژه‌های موسیقی، پرامپت‌ها، متن ترانه و کارهای روزانه است. رابط React در نسخهٔ دسکتاپ Electron و اپ Android (Capacitor) استفاده می‌شود.

## امکانات
- بخش‌های Prompts، Music، Video، Plugins، Suno Prompts، Lyrics، Tasks و Quick Notes
- جست‌وجو، آرشیو، بازیابی، حذف و ذخیرهٔ محلی
- پنج زبان در بخش Lyrics: فارسی، انگلیسی، ترکی آذربایجانی، ترکی استانبولی و روسی
- همگام‌سازی بین Android و Windows با یک فایل مشترک Google Drive
- نگه‌داشتن هر دو نسخه در صورت تعارض و جلوگیری از بازگشت ورودی‌های حذف‌شده

## راه‌اندازی همگام‌سازی Google Drive
این روش از file picker خود Android و پوشهٔ محلی Google Drive for desktop در Windows استفاده می‌کند؛ نیازی به ساخت Google OAuth client یا ارسال رمز حساب به برنامه نیست.

1. در Windows، **Google Drive for desktop** را نصب کن و مطمئن شو فایل همگام‌سازی در Drive قابل‌دسترسی آفلاین است.
2. در DA Works، از بخش **Sync** یک فایل `DA Works Sync.json` داخل پوشهٔ Google Drive بساز یا فایل موجود را انتخاب کن.
3. در Android، از همان بخش و با file picker اندروید **همان فایل** را از Google Drive انتخاب کن. اگر فایل را در موبایل ساختی، آن را در دسکتاپ از پوشهٔ Drive انتخاب کن.
4. در Android روی **همگام‌سازی اکنون** بزن. در Windows برنامه هنگام آنلاین‌شدن، باز شدن/فعال‌شدن برنامه و به‌صورت دوره‌ای فایل را بررسی می‌کند.

تغییرها ابتدا محلی ذخیره می‌شوند؛ اگر اینترنت قطع باشد، می‌توانی بعداً دوباره Sync بزنی. اگر دو نسخهٔ متفاوت از یک ورودی پیدا شود، نسخهٔ متعارض به‌صورت یک کپی جدا نگه داشته می‌شود. فایل Drive شامل متن‌های workspace به‌صورت JSON معمولی است و رمزگذاری سرتاسری ندارد؛ دسترسی فایل را با حساب Google خودت کنترل کن.

## ساخت Windows x64
Node.js نسخهٔ `22.12` یا جدیدتر:

```powershell
npm ci
npm test
npm run dist:win
```

خروجی در پوشهٔ `release` با نامی شبیه `DA-Works-Setup-1.0.1-x64.exe` قرار می‌گیرد. در GitHub Actions نیز workflow **Build Windows x64 installer** همین نصاب را می‌سازد.

## ساخت Android APK
برای ساخت محلی به Node.js نسخهٔ `22.12` یا جدیدتر، JDK `21` و Android SDK نیاز است:

```bash
npm ci
npm test
npm run android:apk
```

APK آزمایشی (debug-signed) در این مسیر ساخته می‌شود:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

یا در GitHub Actions، workflow **Build Android APK** را اجرا و Artifact به نام `DA-Works-Android-APK` را دانلود کن. این APK برای نصب مستقیم/آزمایش است؛ برای انتشار در Google Play و به‌روزرسانی پایدار باید keystore انتشار اختصاصی تنظیم شود.

## توسعه

```bash
npm ci
npm run electron:dev
```

برای همگام‌سازی فایل‌های وب با پروژهٔ Android:

```bash
npm run android:sync
```

## نکات داده
- داده‌های اصلی برنامه روی همان دستگاه باقی می‌مانند؛ sync فقط وقتی فایل مشترک Google Drive تنظیم شده باشد انجام می‌شود.
- فایل همگام‌سازی را حذف یا جابه‌جا نکن؛ اگر Drive for desktop آن را آفلاین نگه ندارد، برنامه ممکن است تا آنلاین‌شدن Drive به آن دسترسی نداشته باشد.
- برای انتشار عمومی، نسخهٔ Windows را code-sign و APK را با keystore انتشار امضا کن.
