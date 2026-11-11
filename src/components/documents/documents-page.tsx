"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Download, ExternalLink, Eye, FolderKanban, GripVertical, Link2, MoreHorizontal, Pencil, Pin, PinOff, RefreshCw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydrated } from "@/hooks/hydrated";
import { useProjects } from "@/hooks/queries";
import { fmt, t } from "@/i18n";
import { formatInstant, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatBytes } from "./file-types";
import { DocIcon, DocLink, DocumentPreview, LinkDialog, typeLabel, useFilePicker } from "./parts";
import {
  downloadHref,
  dragHasFiles,
  useDocuments,
  usePinDocument,
  useRemoveDocument,
  useReorderDocuments,
  useUpdateDocument,
  useUpload,
  type DocumentDto,
} from "./use-documents";

const s = t.documents;
const NONE = "none";

export function DocumentsPage() {
  const docs = useDocuments();
  // Documents are never seeded by the server: show the skeleton until hydration is over (see useHydrated).
  const hydrated = useHydrated();
  const loading = docs.isPending || !hydrated;
  const upload = useUpload();
  const reorder = useReorderDocuments();
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<DocumentDto | null>(null);
  const picker = useFilePicker((files) => upload(files));
  const replacePicker = useFilePicker((files) => {
    if (replaceTarget && files[0]) upload([files[0]], { replaceId: replaceTarget.id });
    setReplaceTarget(null);
  }, false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const list = docs.data ?? [];
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    reorder.mutate(arrayMove(list, from, to).map((d) => d.id));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      list.findIndex((d) => d.id === active.id),
      list.findIndex((d) => d.id === over.id),
    );
  };

  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-5"
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      {picker.input}
      {replacePicker.input}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 aria-hidden />
            {s.addLink}
          </Button>
          <Button variant="outline" onClick={picker.open}>
            <Upload aria-hidden />
            {s.uploadFile}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex h-12 items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors",
          dragging && "border-foreground/40 bg-card text-foreground",
        )}
      >
        {dragging ? (
          s.dropToUpload
        ) : (
          <>
            <button type="button" onClick={picker.open} className="font-medium text-foreground underline-offset-2 hover:underline">
              {s.uploadFile}
            </button>
            <span>{s.dropHint}</span>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading ? (
          <div className="flex flex-col divide-y" aria-busy aria-label={t.common.loading}>
            <div className="flex h-10 items-center gap-4 pl-10 pr-2 text-sm text-muted-foreground">
              <span className="flex-1">{s.columns.name}</span>
              <span className="hidden w-20 sm:block">{s.columns.type}</span>
              <span className="hidden w-16 text-right md:block">{s.columns.size}</span>
              <span className="hidden w-40 md:block">{s.columns.project}</span>
              <span className="hidden w-28 lg:block">{s.columns.updated}</span>
              <span className="w-24" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-12 items-center gap-4 pl-2 pr-2">
                <span className="w-8" />
                <div className="flex flex-1 items-center gap-2.5">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-3.5 w-1/3" />
                </div>
                <Skeleton className="hidden h-3.5 w-12 sm:block" />
                <Skeleton className="hidden h-3.5 w-10 md:block" />
                <Skeleton className="hidden h-3.5 w-24 md:block" />
                <Skeleton className="hidden h-3.5 w-16 lg:block" />
                <span className="w-24" />
              </div>
            ))}
          </div>
        ) : docs.isError ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p>{s.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => docs.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-muted-foreground">{s.empty}</p>
            <Button onClick={picker.open}>
              <Upload aria-hidden />
              {s.uploadFile}
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-0" aria-hidden />
                  <TableHead>{s.columns.name}</TableHead>
                  <TableHead className="hidden sm:table-cell">{s.columns.type}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{s.columns.size}</TableHead>
                  <TableHead className="hidden md:table-cell">{s.columns.project}</TableHead>
                  <TableHead className="hidden lg:table-cell">{s.columns.updated}</TableHead>
                  <TableHead className="w-24 text-right">
                    <span className="sr-only">{s.columns.actions}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={list.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  {list.map((d, i) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      first={i === 0}
                      last={i === list.length - 1}
                      onPreview={setPreview}
                      onMove={(dir) => move(i, i + dir)}
                      onReplace={() => {
                        setReplaceTarget(d);
                        replacePicker.open();
                      }}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        )}
      </div>

      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
      {preview && <DocumentPreview doc={preview} docs={list} onClose={() => setPreview(null)} />}
    </div>
  );
}

function DocumentRow({
  doc,
  first,
  last,
  onPreview,
  onMove,
  onReplace,
}: {
  doc: DocumentDto;
  first: boolean;
  last: boolean;
  onPreview: (d: DocumentDto) => void;
  onMove: (dir: -1 | 1) => void;
  onReplace: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });
  const update = useUpdateDocument();
  const remove = useRemoveDocument();
  const pin = usePinDocument();
  const projects = useProjects();
  const [editing, setEditing] = useState(false);
  // Rename from the menu: keep focus in the input instead of returning it to the menu button.
  const focusInput = useRef(false);

  const saveName = (value: string) => {
    setEditing(false);
    const name = value.trim();
    if (name && name !== doc.name) update.mutate({ id: doc.id, version: doc.version, name });
  };
  const projectOptions = projects.data ?? [];
  const projectLabel = doc.projectId ? (projectOptions.find((p) => p.id === doc.projectId)?.name ?? doc.projectName) : null;

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group h-12", isDragging && "relative z-10 bg-card")}
    >
      <TableCell className="w-8 px-0 pl-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={fmt(s.actions.drag, { name: doc.name })}
          className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </TableCell>
      <TableCell className="max-w-0 w-full">
        {editing ? (
          <Input
            autoFocus
            defaultValue={doc.name}
            aria-label={s.renameLabel}
            maxLength={255}
            className="h-8"
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName(e.currentTarget.value);
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            onBlur={(e) => editing && saveName(e.currentTarget.value)}
          />
        ) : (
          <DocLink doc={doc} onPreview={onPreview} className="flex min-w-0 items-center gap-2.5 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <DocIcon doc={doc} />
            <span className="truncate">{doc.name}</span>
            {doc.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label={s.pinnedFirst} />}
          </DocLink>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">{typeLabel(doc)}</TableCell>
      <TableCell className="num hidden text-right text-muted-foreground md:table-cell">{formatBytes(doc.sizeBytes) ?? t.common.none}</TableCell>
      <TableCell className="hidden max-w-48 truncate md:table-cell">
        {projectLabel ?? <span className="text-muted-foreground">{t.common.none}</span>}
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell" title={formatInstant(doc.updatedAt)}>
        {formatRelative(doc.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          {doc.kind === "file" ? (
            <Button asChild variant="ghost" size="icon-sm" aria-label={`${s.actions.download} ${doc.name}`}>
              <a href={downloadHref(doc)} download>
                <Download aria-hidden />
              </a>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon-sm" aria-label={`${s.actions.open} ${doc.name}`}>
              <a href={doc.url ?? "#"} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={fmt(s.actions.more, { name: doc.name })}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52"
              onCloseAutoFocus={(e) => {
                if (focusInput.current) e.preventDefault();
                focusInput.current = false;
              }}
            >
              {doc.kind === "file" ? (
                <DropdownMenuItem onSelect={() => onPreview(doc)}>
                  <Eye aria-hidden />
                  {s.actions.open}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <a href={doc.url ?? "#"} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden />
                    {s.actions.open}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  focusInput.current = true;
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden />
                {s.actions.rename}
              </DropdownMenuItem>
              {doc.kind === "file" && (
                <DropdownMenuItem onSelect={onReplace}>
                  <RefreshCw aria-hidden />
                  {s.actions.replace}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => pin.mutate({ id: doc.id, pinned: !doc.pinned })}>
                {doc.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                {doc.pinned ? s.actions.unpin : s.actions.pin}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderKanban aria-hidden />
                  {s.actions.project}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={doc.projectId ?? NONE}
                    onValueChange={(v) => update.mutate({ id: doc.id, version: doc.version, projectId: v === NONE ? null : v })}
                  >
                    <DropdownMenuRadioItem value={NONE}>{s.actions.noProject}</DropdownMenuRadioItem>
                    {doc.projectId && !projectOptions.some((p) => p.id === doc.projectId) && (
                      <DropdownMenuRadioItem value={doc.projectId}>{projectLabel}</DropdownMenuRadioItem>
                    )}
                    {projectOptions.map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        <span className="truncate">{p.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
                <ArrowUp aria-hidden />
                {s.actions.moveUp}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
                <ArrowDown aria-hidden />
                {s.actions.moveDown}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(doc)}>
                <Trash2 aria-hidden />
                {s.actions.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
