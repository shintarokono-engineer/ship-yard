import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// UTC プラグインを 1 回だけ extend する。日付・時刻の処理はここから import した dayjs を使う。
dayjs.extend(utc);

export { dayjs };
