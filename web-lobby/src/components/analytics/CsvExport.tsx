// web-lobby/src/components/analytics/CsvExport.tsx
import React, { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { downloadCsv, generatePdf } from '../../lib/api';

const PDF_SECTIONS = [
  { id: 'overview', label: 'Übersicht (DAU, MAU, Stimmen)' },
  { id: 'gold_data', label: 'Gold-Daten (Ja/Nein je Frage)' },
  { id: 'demographics', label: 'Demografie' },
  { id: 'timeseries', label: 'Zeitreihen' },
];

export default function CsvExport() {
  const [isCsvLoading, setIsCsvLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfSections, setPdfSections] = useState<string[]>(['overview', 'gold_data']);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleCsvDownload() {
    setIsCsvLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await downloadCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rawlz_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess('CSV erfolgreich heruntergeladen.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsCsvLoading(false);
    }
  }

  async function handlePdfGenerate() {
    if (!pdfSections.length) {
      setError('Mindestens einen Abschnitt auswählen');
      return;
    }
    setIsPdfLoading(true);
    setError(null);
    setSuccess(null);
    setPdfUrl(null);
    try {
      const res = await generatePdf(pdfSections);
      if (res.url) {
        setPdfUrl(res.url);
        setSuccess('PDF wurde erstellt. Link ist 1 Stunde gültig.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsPdfLoading(false);
    }
  }

  function toggleSection(id: string) {
    setPdfSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Daten-Export</h2>
        <p className="text-gray-500 text-sm mt-1">
          Alle Exporte erzwingen K-Anonymität ≥ 20 – keine Einzelnutzer-Daten
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm">
          {success}
        </div>
      )}

      {/* CSV Export */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl">
            <Download className="text-amber-400" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">CSV-Export</h3>
            <p className="text-gray-500 text-sm mt-1">
              Alle aktiven Fragen mit Ja/Nein-Anteilen als CSV-Tabelle.
              Nur Fragen mit ≥ 20 Stimmen werden exportiert.
            </p>
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-xl p-4 text-xs text-gray-400 font-mono">
          Frage,Gesamt-Stimmen,Ja (%),Nein (%)<br />
          "Klimaschutz",1240,62,38<br />
          "Wahlpflicht",890,45,55
        </div>

        <button
          onClick={handleCsvDownload}
          disabled={isCsvLoading}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {isCsvLoading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
          {isCsvLoading ? 'Exportiere...' : 'CSV herunterladen'}
        </button>
      </div>

      {/* PDF Report */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <FileText className="text-blue-400" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">PDF-Report</h3>
            <p className="text-gray-500 text-sm mt-1">
              Generiert einen strukturierten Report als PDF.
              Link ist 1 Stunde gültig und wird nach 24h gelöscht.
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-3">Abschnitte auswählen:</p>
          <div className="grid grid-cols-2 gap-2">
            {PDF_SECTIONS.map(s => (
              <label
                key={s.id}
                className={`
                  flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors
                  ${pdfSections.includes(s.id)
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={pdfSections.includes(s.id)}
                  onChange={() => toggleSection(s.id)}
                  className="w-4 h-4 accent-amber-500"
                />
                <span className={`text-sm ${pdfSections.includes(s.id) ? 'text-amber-400' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handlePdfGenerate}
          disabled={isPdfLoading || pdfSections.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {isPdfLoading ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
          {isPdfLoading ? 'Generiere PDF...' : 'PDF generieren'}
        </button>

        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors"
          >
            <Download size={18} />
            PDF herunterladen (1h gültig)
          </a>
        )}
      </div>
    </div>
  );
}
