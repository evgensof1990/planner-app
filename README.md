# Плановик

Планировщик дел в стиле TickTick: задачи, планы на неделю, проекты с секциями и канбаном, теги, привычки, календарь, помодоро-таймер. Тёмная тема, фиолетовый акцент.

Одна кодовая база на React + Vite, Android-сборка через Capacitor. Данные хранятся на устройстве и синхронизируются между устройствами через приватный GitHub Gist (Настройки → Синхронизация, нужен токен с доступом gist).

Веб-версия: https://evgensof1990.github.io/planner-app/

## Запуск на компьютере

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # статическая сборка в dist/
npm run build:single  # один самодостаточный файл dist-single/index.html
```

## Android

APK собирается автоматически GitHub Actions при каждом пуше в `main`: смотрите раздел Releases или ветку `builds`.

Локально (нужен Android Studio / SDK):

```bash
npm run android
cd android && ./gradlew assembleRelease
```
