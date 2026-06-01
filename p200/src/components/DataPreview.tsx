import React from 'react';

interface DataPreviewProps {
  data: Record<string, unknown>[];
  headers: string[];
}

export const DataPreview: React.FC<DataPreviewProps> = ({ data, headers }) => {
  const displayData = data.slice(0, 20);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        数据预览
        <span className="text-sm font-normal text-gray-400 ml-2">
          (前 {displayData.length} 行，共 {data.length} 行)
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50">
              <th className="px-4 py-3 text-left text-gray-300 font-medium sticky left-0 bg-gray-800/50 z-10">
                #
              </th>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-gray-300 font-medium whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, index) => (
              <tr
                key={index}
                className={`border-t border-gray-700 ${
                  index % 2 === 0 ? 'bg-primary' : 'bg-card/30'
                } hover:bg-accent/10 transition-colors`}
              >
                <td className="px-4 py-2 text-gray-400 sticky left-0 bg-inherit">
                  {index + 1}
                </td>
                {headers.map((header) => (
                  <td
                    key={header}
                    className="px-4 py-2 text-gray-300 whitespace-nowrap"
                  >
                    {String(row[header] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
