import React from 'react';

interface TableHeaderProps {
  dimensions: any[];
}

export const TableHeader: React.FC<TableHeaderProps> = ({ dimensions }) => {
  return (
    <thead>
      <tr>
        <th className="text-left p-2 border-b">Data</th>
        {dimensions.map((dim, index) => (
          <th key={index} className="text-left p-2 border-b">{dim.name}</th>
        ))}
      </tr>
    </thead>
  );
};