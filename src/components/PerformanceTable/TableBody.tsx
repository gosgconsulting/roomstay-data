import React from 'react';

interface TableBodyProps {
  rows: any[];
  dimensions: any[];
}

export const TableBody: React.FC<TableBodyProps> = ({ rows, dimensions }) => {
  return (
    <tbody>
      {rows.map((row, index) => (
        <tr key={index}>
          <td className="p-2 border-b">{row.group_key || 'N/A'}</td>
          {dimensions.map((dim, dimIndex) => (
            <td key={dimIndex} className="p-2 border-b">
              {row.dimension_values?.[dim.id] || 'N/A'}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
};