import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
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
