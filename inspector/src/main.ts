import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import './summary.css';
mount(App, { target: document.getElementById('app')! });
