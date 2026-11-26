export function NeckerchiefMascot({ kind }: { kind: 'task' | 'evaluation' }) {
  return (
    <span className={'neckerchief-mascot neckerchief-mascot-' + kind} aria-hidden="true">
      <img
        src={kind === 'task' ? '/monkey-vine-2d.webp' : '/evaluation-pending.webp'}
        width={kind === 'task' ? 569 : 560}
        height={kind === 'task' ? 650 : 560}
        alt=""
      />
    </span>
  );
}
