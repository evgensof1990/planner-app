# Плановик

Планировщик дел в стиле TickTick: задачи, планы на неделю, проекты с секциями и канбаном, теги, привычки, календарь, помодоро-таймер. Тёмная тема, фиолетовый акцент.

Одна кодовая база на React + Vite, Android-сборка через Capacitor. Данные хранятся локально на устройстве (перенос между устройствами: Настройки → Копировать / Вставить или файл).

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
