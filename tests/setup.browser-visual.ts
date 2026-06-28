import { beforeEach } from 'vitest';

beforeEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.style.colorScheme = 'light';
  document.body.classList.remove('bg-background', 'text-foreground');
  document.body.classList.add('bg-background', 'text-foreground');
  localStorage.setItem('theme', 'light');
});
