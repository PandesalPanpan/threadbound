// Presentation composition root for the shared Adventure Stream.
// The extensions query DOM created by adventure-stream.js, so load the owner first.
// Keeping this sequencing here avoids coupling either extension to transport/domain code.
await import('./adventure-stream.js');
await Promise.all([
  import('./adventure-meta-commands.js'),
  import('./combat-skills.js'),
]);
