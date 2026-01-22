import { useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import {
  Upload,
  FileVideo,
  FileImage,
  Loader2,
  Download,
  X,
  ChevronDown,
} from "lucide-react";

const IMAGE_FORMATS = [
  { value: "jpg", label: "JPEG", mime: "image/jpeg" },
  { value: "jpeg", label: "JPEG", mime: "image/jpeg" },
  { value: "png", label: "PNG", mime: "image/png" },
  { value: "webp", label: "WebP", mime: "image/webp" },
  { value: "gif", label: "GIF", mime: "image/gif" },
  { value: "bmp", label: "BMP", mime: "image/bmp" },
  { value: "tiff", label: "TIFF", mime: "image/tiff" },
  { value: "tif", label: "TIFF", mime: "image/tiff" },
  { value: "avif", label: "AVIF", mime: "image/avif" },
  { value: "ico", label: "ICO", mime: "image/x-icon" },
] as const;

const getMimeType = (format: string): string => {
  const formatInfo = IMAGE_FORMATS.find(
    (f) => f.value === format.toLowerCase(),
  );
  if (formatInfo) return formatInfo.mime;

  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
    ico: "image/x-icon",
  };

  return mimeMap[format.toLowerCase()] || "image/png";
};

interface ProcessedFile {
  file: File;
  id: string;
  status: "pending" | "converting" | "completed" | "error";
  preview: string;
  outputUrl?: string;
  outputFormat?: string;
}

const App = () => {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [ready, setReady] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    const ffmpeg = ffmpegRef.current;

    try {
      const coreBlobURL = await toBlobURL(coreURL, "text/javascript");
      const wasmBlobURL = await toBlobURL(wasmURL, "application/wasm");

      await ffmpeg.load({
        coreURL: coreBlobURL,
        wasmURL: wasmBlobURL,
      });

      console.log("FFmpeg успешно загружен");
      setReady(true);
    } catch (error) {
      console.error("Критическая ошибка загрузки FFmpeg:", error);
    }
  };
  const onDrop = (acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => {
      const isImage = file.type.startsWith("image/");
      const defaultFormat = isImage ? "png" : "mp4";

      return {
        file,
        id: Math.random().toString(36).substring(7),
        status: "pending" as const,
        preview: URL.createObjectURL(file),
        outputFormat: defaultFormat,
      };
    });
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".bmp",
        ".tiff",
        ".tif",
        ".avif",
        ".ico",
        ".svg",
      ],
      "video/*": [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"],
    },
  });

  const convertFile = async (fileObj: ProcessedFile) => {
    const ffmpeg = ffmpegRef.current;

    const safeExt = fileObj.file.name.includes(".")
      ? fileObj.file.name.split(".").pop()!
      : "bin";

    const inputName = `input_${fileObj.id}.${safeExt}`;
    const outputFormat = fileObj.outputFormat || "png";
    const outputName = `output_${fileObj.id}.${outputFormat}`;
    const isImage = fileObj.file.type.startsWith("image/");

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileObj.id ? { ...f, status: "converting" } : f,
      ),
    );

    try {
      const fileData = await fetchFile(fileObj.file);
      await ffmpeg.writeFile(inputName, fileData);

      if (isImage) {
        const args = ["-i", inputName];
        if (["jpg", "jpeg", "webp"].includes(outputFormat)) {
          args.push("-q:v", "2");
        }
        args.push(outputName);
        await ffmpeg.exec(args);
      } else {
        await ffmpeg.exec([
          "-i",
          inputName,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          outputName,
        ]);
      }
      const data = await ffmpeg.readFile(outputName);
      const mimeType = getMimeType(outputFormat);

      let blobData: Uint8Array;
      if (data instanceof Uint8Array) {
        blobData = data;
      } else {
        blobData = new Uint8Array(data as any);
      }

      if (!blobData || blobData.length === 0) {
        throw new Error("FFmpeg produced an empty file.");
      }
      const cleanBuffer = new Uint8Array(blobData.length);
      cleanBuffer.set(blobData);
      const blob = new Blob([cleanBuffer.buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileObj.id
            ? { ...f, status: "completed", outputUrl: url }
            : f,
        ),
      );
    } catch (err) {
      console.error("Conversion Error:", err);
      setFiles((prev) =>
        prev.map((f) => (f.id === fileObj.id ? { ...f, status: "error" } : f)),
      );
    } finally {
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {}
    }
  };

  const updateOutputFormat = (fileId: string, format: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, outputFormat: format } : f)),
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Converter
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Конвертируйте файлы прямо в браузере. Быстро. Приватно. Бесплатно.
          </p>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center p-20 border-2 border-dashed rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-sm font-medium">
              Загрузка модулей обработки...
            </span>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`group relative flex flex-col items-center justify-center w-full py-16 border-2 border-dashed rounded-xl transition-all cursor-pointer
              ${isDragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-400 dark:bg-slate-900 dark:border-slate-800"}`}
          >
            <input {...getInputProps()} />
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 text-slate-600 dark:text-slate-300" />
            </div>
            <p className="text-sm font-medium">
              Перетащите файлы для конвертации
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Изображения: JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, ICO и др.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Видео: MP4, AVI, MOV, MKV, WebM и др. (до 2GB)
            </p>
          </div>
        )}

        <div className="space-y-4">
          {files.map((f) => {
            const isImage = f.file.type.startsWith("image/");
            const currentFormat = f.outputFormat || (isImage ? "png" : "mp4");

            return (
              <div
                key={f.id}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 overflow-hidden flex-1">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                      {f.file.type.includes("video") ? (
                        <FileVideo size={24} />
                      ) : (
                        <FileImage size={24} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate dark:text-slate-200">
                        {f.file.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(f.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {f.status === "pending" && (
                      <button
                        onClick={() => convertFile(f)}
                        className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Конвертировать
                      </button>
                    )}
                    {f.status === "converting" && (
                      <div className="flex items-center text-xs text-slate-500 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin mr-2" />{" "}
                        Обработка...
                      </div>
                    )}
                    {f.status === "completed" && f.outputUrl && (
                      <a
                        href={f.outputUrl}
                        download={`converted_${f.file.name.split(".").slice(0, -1).join(".")}.${currentFormat}`}
                        className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Скачать"
                      >
                        <Download size={18} />
                      </a>
                    )}
                    {f.status === "completed" && !f.outputUrl && (
                      <span className="text-xs text-red-500">
                        Ошибка создания файла
                      </span>
                    )}
                    <button
                      onClick={() =>
                        setFiles((prev) =>
                          prev.filter((item) => item.id !== f.id),
                        )
                      }
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {isImage && f.status === "pending" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <label className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      Формат вывода:
                    </label>
                    <div className="relative flex-1 max-w-[200px]">
                      <select
                        value={currentFormat}
                        onChange={(e) =>
                          updateOutputFormat(f.id, e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-200"
                      >
                        {IMAGE_FORMATS.filter(
                          (format, index, self) =>
                            // Убираем дубликаты (jpg и jpeg показываем как один вариант)
                            index ===
                            self.findIndex((f) => f.label === format.label),
                        ).map((format) => (
                          <option key={format.value} value={format.value}>
                            {format.label} (.{format.value})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default App;
