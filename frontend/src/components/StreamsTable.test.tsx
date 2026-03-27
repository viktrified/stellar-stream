import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StreamTable } from '../components/StreamsTable'; 
import { Stream } from '../types/stream'; 

const mockStreams: Stream[] = [
  {
    id: '1',
    sender: 'G_SENDER',
    recipient: 'G_RECIPIENT123',
    assetCode: 'USDC',
    totalAmount: 100,
    durationSeconds: 3600,
    startAt: 1670000000,
    createdAt: 1670000000,
    progress: { status: 'active', vestedAmount: 20, remainingAmount: 80, percentComplete: 20 }
  } as unknown as Stream
];

describe('StreamsTable Component', () => {
  it('renders table data when streams are passed', () => {
    render(<StreamTable streams={mockStreams} />);
    
    // Checking for text elements populated by the array map
    expect(screen.getByText(/G_RECIPIENT123/i)).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('renders an empty state nicely', () => {
    render(<StreamTable streams={[]} />);
    // You can modify this string query based on what you actually render for 0 items
    expect(screen.queryByText(/G_RECIPIENT123/i)).not.toBeInTheDocument();
  });
});