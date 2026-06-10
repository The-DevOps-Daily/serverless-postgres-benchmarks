import { neon } from "./providers/neon.js";
import { supabase } from "./providers/supabase.js";
import type { Provider } from "./types.js";

async function teardown(provider: Provider): Promise<void> {
  let projects: Array<{ id: string; name: string }>;
  try {
    projects = await provider.listBenchProjects();
  } catch (error) {
    console.error(`[teardown] ${provider.name}: listing failed:`, (error as Error).message);
    return;
  }
  if (projects.length === 0) {
    console.log(`[teardown] ${provider.name}: nothing to clean up`);
    return;
  }
  for (const project of projects) {
    try {
      await provider.deleteProject(project.id);
      console.log(`[teardown] ${provider.name}: deleted ${project.name} (${project.id})`);
    } catch (error) {
      console.error(
        `[teardown] ${provider.name}: failed to delete ${project.name}:`,
        (error as Error).message,
      );
    }
  }
}

await teardown(neon);
await teardown(supabase);
