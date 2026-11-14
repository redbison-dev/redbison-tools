import React from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PRIVACY_SECTIONS, type PrivacySectionKey } from '@/components/layout/privacyContent';

/**
 * Shows one privacy disclosure in a dialog, so the footer can answer
 * "what do you do with my data?" without navigating away from a tool.
 * Same content as the /privacy page, which the dialog links to.
 */
const PrivacyDialog = ({
  section,
  onOpenChange,
}: {
  section: PrivacySectionKey | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const entry = section ? PRIVACY_SECTIONS[section] : null;
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{entry.title}</DialogTitle>
              <DialogDescription>{entry.description}</DialogDescription>
            </DialogHeader>
            <div className="pt-1 text-left">
              <entry.Body />
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              The source is the authority, not this summary.{' '}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground" onClick={() => onOpenChange(false)}>
                Open the full privacy page
              </Link>
              .
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PrivacyDialog;
