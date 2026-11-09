export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {typeof title === "string" ? (
          <h1 className="font-oswald text-2xl font-semibold tracking-tight text-[#221810]">
            {title}
          </h1>
        ) : (
          title
        )}
        {description ? (
          <p className="mt-1 text-sm text-[#221810]/55">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
