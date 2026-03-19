import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  useTheme,
} from '@mui/material';
import QRCode from 'react-qr-code';
import { useTranslation } from './LocalizationProvider';

const defaultTokenTtlMs = 7 * 24 * 60 * 60 * 1000;

const parseQuery = (value) => {
  const params = new URLSearchParams();
  const normalized = value.trim().replace(/^\?/, '');
  if (!normalized) {
    return params;
  }
  new URLSearchParams(normalized).forEach((paramValue, key) => {
    params.set(key, paramValue);
  });
  return params;
};

const buildCommandSocketUrl = (serverUrl) => {
  try {
    return new URL('/api/socket/commands', serverUrl).toString();
  } catch {
    return '';
  }
};

const buildQrUrl = (serverUrl, queryString) => {
  if (!queryString) {
    return serverUrl;
  }
  return `${serverUrl}${serverUrl.includes('?') ? '&' : '?'}${queryString}`;
};

const QrCodeDialog = ({ open, onClose, device }) => {
  const theme = useTheme();
  const t = useTranslation();

  const [serverUrl, setServerUrl] = useState(window.location.origin);
  const [queryParams, setQueryParams] = useState('');
  const [tokenError, setTokenError] = useState('');
  const serverUrlRef = useRef(serverUrl);

  const serverUrlValid = useMemo(() => {
    try {
      // Accept only absolute http/https URLs for predictable QR payloads.
      const parsed = new URL(serverUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, [serverUrl]);

  const fetchWebSocketToken = useCallback(async () => {
    setTokenError('');
    try {
      const expiration = new Date(Date.now() + defaultTokenTtlMs).toISOString();
      const response = await fetch('/api/session/token', {
        method: 'POST',
        body: new URLSearchParams(`expiration=${expiration}`),
      });
      if (!response.ok) {
        throw new Error(`Token request failed (${response.status})`);
      }
      const token = await response.text();
      setQueryParams((previousValue) => {
        const previousParams = parseQuery(previousValue);
        previousParams.set('websocket_token', token);
        return previousParams.toString();
      });
    } catch {
      setTokenError(t('commandQrTokenError'));
    }
  }, [t]);

  useEffect(() => {
    serverUrlRef.current = serverUrl;
  }, [serverUrl]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const params = new URLSearchParams();
    if (device?.uniqueId) {
      params.set('id', device.uniqueId);
    }
    const websocketUrl = buildCommandSocketUrl(serverUrlRef.current);
    if (websocketUrl) {
      params.set('websocket_url', websocketUrl);
    }
    params.set('websocket_enabled', 'true');
    params.set('command_transport_mode', 'auto');
    params.set('use_fcm_fallback', 'true');
    setQueryParams(params.toString());
    fetchWebSocketToken();
  }, [open, device?.uniqueId, fetchWebSocketToken]);

  const mergedQuery = useMemo(() => {
    const defaults = new URLSearchParams();
    if (device?.uniqueId) {
      defaults.set('id', device.uniqueId);
    }
    const websocketUrl = buildCommandSocketUrl(serverUrl);
    if (websocketUrl) {
      defaults.set('websocket_url', websocketUrl);
    }
    defaults.set('websocket_enabled', 'true');
    defaults.set('command_transport_mode', 'auto');
    defaults.set('use_fcm_fallback', 'true');

    const manualParams = parseQuery(queryParams);
    manualParams.forEach((value, key) => {
      defaults.set(key, value);
    });
    return defaults.toString();
  }, [serverUrl, device?.uniqueId, queryParams]);

  const fullUrl = serverUrlValid ? buildQrUrl(serverUrl, mergedQuery) : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent>
        <Box display="flex" justifyContent="center" mb={2}>
          <QRCode value={fullUrl} size={theme.dimensions.qrCodeSize} />
        </Box>

        <TextField
          label={t('settingsServer')}
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          margin="dense"
          fullWidth
          error={!serverUrlValid}
          helperText={!serverUrlValid ? t('commandQrInvalidServerUrl') : undefined}
        />

        <TextField
          label={t('commandConfiguration')}
          value={queryParams}
          onChange={(e) => setQueryParams(e.target.value)}
          margin="dense"
          fullWidth
          helperText={t('commandQrMergedHelp')}
        />
        {tokenError && <Alert severity="warning">{tokenError}</Alert>}
      </DialogContent>

      <DialogActions>
        <Button onClick={fetchWebSocketToken}>{t('commandQrRefreshToken')}</Button>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default QrCodeDialog;
