export function stepBanner(title: string): void {
  console.log(`\n╔══ ${title} ══╗`);
}

export function separator(): void {
  console.log("═".repeat(60));
}

export function info(msg: string): void {
  console.log(`   ${msg}`);
}
