import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// UTC プラグインを 1 回だけ extend する。日付・時刻の処理はここから import した dayjs を使う。
dayjs.extend(utc);

/**
 * JST の UTC オフセット(時間)。日本は夏時間が無いため固定 +9 で正確に扱える。
 * `dayjs(d).utcOffset(JST_OFFSET_HOURS)` の形で使う(timezone プラグインは不要)。
 */
export const JST_OFFSET_HOURS = 9;

export { dayjs };
