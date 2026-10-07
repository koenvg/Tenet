import { hydrateRoot } from 'react-dom/client';
import MarketingPage from './MarketingPage.js';
import DocsPage from './DocsPage.js';
import '../../web/theme.css';
import '../style.css';

const Page = location.pathname.endsWith('/docs.html') ? DocsPage : MarketingPage;
hydrateRoot(document.getElementById('app')!, <Page />);
