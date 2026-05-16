import { vi } from 'vitest';

vi.stubEnv('DEV', 'false');
vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
