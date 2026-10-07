import { createRoot } from 'react-dom/client';
import App from './App.js';
import '../../web/theme.css';
import './style.css';
import './summary.css';
import './components.css';

createRoot(document.getElementById('app')!).render(<App />);
