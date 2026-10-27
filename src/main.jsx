import { createRoot } from 'react-dom/client';
// Golos Text: close to Yandex Sans of Yandex Calendar, free (OFL), bundled for offline use
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import './styles.css';
import { StoreProvider } from './store.jsx';
import App from './App.jsx';
import { isNative } from './notify.js';

if (isNative) {
  import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#101010' });
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>
);
