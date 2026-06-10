/**
 * /admin — secret-code-gated admin dashboard (Vercel/shadcn-ish dark look).
 *
 * Gate: a "secret code" (not an account) unlocks it; the unlock persists in
 * AsyncStorage. NOTE: this is a soft client-side gate — real data protection
 * comes from Firestore rules (see the rules snippet in the PR/notes). All reads
 * are fail-soft so a permission-denied on one collection doesn't blank the page.
 *
 * Surfaces: Fable refusals (the prompt that made Fable refuse), generation
 * stats, recent stories + transcripts, user/signup counts, and daily activity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { auth, db } from '@/config/firebase';

const SECRET_CODE = 'saintaubin694135';
const UNLOCK_KEY = 'admin_unlocked_v1';
// The secret code unlocks the UI, but Firestore only returns data to these
// accounts (rules use the email allowlist). Used purely to show a helpful
// banner — it is NOT the security boundary.
const ADMIN_EMAILS = ['ellepotterhead2006@gmail.com', 'madxwoods@gmail.com'];

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}
function fmtWhen(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function dayKey(d: Date | null): string {
  if (!d) return 'unknown';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─────────────────────────── small UI atoms ─────────────────────────── */

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'red' | 'amber' | 'green' }) {
  const map = {
    neutral: 'bg-white/10 text-white/70',
    red: 'bg-red-500/15 text-red-300',
    amber: 'bg-amber-500/15 text-amber-300',
    green: 'bg-emerald-500/15 text-emerald-300',
  } as const;
  return (
    <View className={`rounded-full px-2 py-0.5 ${map[tone].split(' ')[0]} ${map[tone].split(' ')[1] ?? ''}`}>
      <Text className={`text-[11px] font-medium ${map[tone].split(' ').slice(1).join(' ')}`}>{children}</Text>
    </View>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</View>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="flex-1 min-w-[150px]">
      <Text className="text-[12px] uppercase tracking-wide text-white/40">{label}</Text>
      <Text className="mt-1 text-[26px] font-semibold text-white">{value}</Text>
      {sub ? <Text className="mt-0.5 text-[12px] text-white/40">{sub}</Text> : null}
    </Card>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="mb-3 mt-7 flex-row items-center justify-between">
      <Text className="text-[15px] font-semibold text-white">{children}</Text>
      {right}
    </View>
  );
}

/* ─────────────────────────── secret-code gate ─────────────────────────── */

function CodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (code.trim() === SECRET_CODE) onUnlock();
    else setErr('incorrect secret code');
  };
  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <View className="w-full max-w-[360px] rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <Text className="text-[18px] font-semibold text-white">admin</Text>
        <Text className="mt-1 text-[13px] text-white/40">enter the secret code to continue</Text>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setErr('');
          }}
          onSubmitEditing={submit}
          placeholder="secret code"
          placeholderTextColor="rgba(255,255,255,0.3)"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          className="mt-4 h-11 rounded-lg border border-white/15 bg-black px-3 text-white"
        />
        {err ? <Text className="mt-2 text-[12px] text-red-400">{err}</Text> : null}
        <Pressable onPress={submit} className="mt-4 h-11 items-center justify-center rounded-lg bg-white">
          <Text className="text-[14px] font-semibold text-black">unlock</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─────────────────────────── dashboard ─────────────────────────── */

type Loaded = {
  usersCount: number | null;
  storiesCount: number | null;
  refusals: any[];
  recentStories: any[];
  recentSignups: any[];
  errors: Record<string, string>;
};

function Dashboard({ onLock }: { onLock: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Loaded>({
    usersCount: null,
    storiesCount: null,
    refusals: [],
    recentStories: [],
    recentSignups: [],
    errors: {},
  });

  const load = useCallback(async () => {
    setLoading(true);
    const errors: Record<string, string> = {};
    const safe = async <T,>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (e: any) {
        errors[key] = e?.message || 'failed to load';
        return fallback;
      }
    };

    const [usersCount, storiesCount, refusals, recentStories, recentSignups] = await Promise.all([
      safe('usersCount', async () => (await getCountFromServer(collection(db, 'users'))).data().count, null as number | null),
      safe('storiesCount', async () => (await getCountFromServer(collection(db, 'stories'))).data().count, null as number | null),
      safe(
        'refusals',
        async () =>
          (await getDocs(query(collection(db, 'fableRefusals'), orderBy('createdAt', 'desc'), limit(100)))).docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        [] as any[],
      ),
      safe(
        'recentStories',
        async () =>
          (await getDocs(query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(60)))).docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        [] as any[],
      ),
      safe(
        'recentSignups',
        async () =>
          (await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(20)))).docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        [] as any[],
      ),
    ]);

    setData({ usersCount, storiesCount, refusals, recentStories, recentSignups, errors });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Derived generation stats from the recent-stories sample.
  const stats = useMemo(() => {
    const s = data.recentStories;
    const byMode: Record<string, number> = {};
    let nsfw = 0;
    for (const st of s) {
      const m = st.narrationMode || 'unknown';
      byMode[m] = (byMode[m] || 0) + 1;
      if (st.isNighttime) nsfw += 1;
    }
    const refusalCount = data.refusals.filter((r) => r.kind === 'refusal').length;
    const errorCount = data.refusals.filter((r) => r.kind !== 'refusal').length;
    return { sample: s.length, byMode, nsfw, sfw: s.length - nsfw, refusalCount, errorCount };
  }, [data]);

  // Daily activity from recent stories.
  const daily = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of data.recentStories) {
      const k = dayKey(tsToDate(st.createdAt));
      counts[k] = (counts[k] || 0) + 1;
    }
    const entries = Object.entries(counts);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    return { entries, max };
  }, [data.recentStories]);

  return (
    <ScrollView className="flex-1 bg-black" contentContainerStyle={{ padding: 16, paddingBottom: 64, maxWidth: 1100, alignSelf: 'center', width: '100%' }}>
      {/* header */}
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-[22px] font-semibold text-white">{'{yn}'} admin</Text>
          <Text className="text-[12px] text-white/40">internal dashboard</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={load} className="h-9 items-center justify-center rounded-lg border border-white/15 px-3">
            <Text className="text-[13px] text-white/80">{loading ? '…' : 'refresh'}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/')} className="h-9 items-center justify-center rounded-lg border border-white/15 px-3">
            <Text className="text-[13px] text-white/80">app</Text>
          </Pressable>
          <Pressable onPress={onLock} className="h-9 items-center justify-center rounded-lg border border-white/15 px-3">
            <Text className="text-[13px] text-white/80">lock</Text>
          </Pressable>
        </View>
      </View>

      {!ADMIN_EMAILS.includes(auth.currentUser?.email || '') ? (
        <View className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <Text className="text-[13px] text-amber-300">
            you&apos;re not signed into the app as an admin account, so the data below won&apos;t load. sign in as an admin email, then reopen /admin.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View className="mt-20 items-center">
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <>
          {/* stat row */}
          <View className="mt-5 flex-row flex-wrap gap-3">
            <StatCard label="users" value={data.usersCount ?? '—'} />
            <StatCard label="stories" value={data.storiesCount ?? '—'} />
            <StatCard label="fable refusals" value={stats.refusalCount} sub="content-moderation" />
            <StatCard label="fable errors" value={stats.errorCount} sub="api/timeout → grok" />
          </View>

          {/* refusals — the headline */}
          <SectionTitle right={<Badge tone="red">{data.refusals.length} logged</Badge>}>
            what made fable refuse
          </SectionTitle>
          {data.errors.refusals ? (
            <Card>
              <Text className="text-[13px] text-amber-300">couldn&apos;t load fableRefusals — {data.errors.refusals}</Text>
              <Text className="mt-1 text-[12px] text-white/40">add a Firestore rule allowing reads on `fableRefusals` (see notes).</Text>
            </Card>
          ) : data.refusals.length === 0 ? (
            <Card>
              <Text className="text-[13px] text-white/50">no fable failures logged yet — Fable hasn&apos;t refused or errored.</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {data.refusals.map((r) => (
                <RefusalCard key={r.id} r={r} />
              ))}
            </View>
          )}

          {/* generation stats */}
          <SectionTitle right={<Badge>recent {stats.sample}</Badge>}>generation stats</SectionTitle>
          <Card>
            <View className="flex-row flex-wrap gap-x-6 gap-y-2">
              <Text className="text-[13px] text-white/70">sfw <Text className="text-white">{stats.sfw}</Text></Text>
              <Text className="text-[13px] text-white/70">nsfw <Text className="text-white">{stats.nsfw}</Text></Text>
              {Object.entries(stats.byMode).map(([m, n]) => (
                <Text key={m} className="text-[13px] text-white/70">
                  {m} <Text className="text-white">{n}</Text>
                </Text>
              ))}
            </View>
            <Text className="mt-2 text-[12px] text-white/40">
              grok-fallback events (all-time): {data.refusals.length} • computed from the {stats.sample} most recent stories
            </Text>
          </Card>

          {/* daily activity */}
          <SectionTitle>daily activity</SectionTitle>
          {data.errors.recentStories ? (
            <Card>
              <Text className="text-[13px] text-amber-300">couldn&apos;t load stories — {data.errors.recentStories}</Text>
            </Card>
          ) : (
            <Card>
              {daily.entries.length === 0 ? (
                <Text className="text-[13px] text-white/50">no recent stories.</Text>
              ) : (
                <View className="gap-2">
                  {daily.entries.map(([day, n]) => (
                    <View key={day} className="flex-row items-center gap-3">
                      <Text className="w-16 text-[12px] text-white/50">{day}</Text>
                      <View className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                        <View className="h-2 rounded-full bg-white/60" style={{ width: `${(n / daily.max) * 100}%` }} />
                      </View>
                      <Text className="w-8 text-right text-[12px] text-white/70">{n}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}

          {/* recent stories + transcripts */}
          <SectionTitle>recent stories</SectionTitle>
          {data.recentStories.length === 0 ? (
            <Card>
              <Text className="text-[13px] text-white/50">none.</Text>
            </Card>
          ) : (
            <View className="gap-3">
              {data.recentStories.slice(0, 20).map((s) => (
                <StoryCard key={s.id} s={s} />
              ))}
            </View>
          )}

          {/* recent signups */}
          <SectionTitle right={<Badge>{data.usersCount ?? '—'} total</Badge>}>recent signups</SectionTitle>
          {data.errors.recentSignups ? (
            <Card>
              <Text className="text-[13px] text-amber-300">couldn&apos;t load users — {data.errors.recentSignups}</Text>
            </Card>
          ) : (
            <Card>
              {data.recentSignups.length === 0 ? (
                <Text className="text-[13px] text-white/50">none.</Text>
              ) : (
                <View className="gap-2">
                  {data.recentSignups.map((u) => (
                    <View key={u.id} className="flex-row items-center justify-between">
                      <Text className="text-[13px] text-white/80" numberOfLines={1}>
                        {u.email || u.displayName || u.id}
                      </Text>
                      <Text className="text-[12px] text-white/40">{fmtWhen(tsToDate(u.createdAt))}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function RefusalCard({ r }: { r: any }) {
  const [open, setOpen] = useState(false);
  const isRefusal = r.kind === 'refusal';
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge tone={isRefusal ? 'red' : 'amber'}>{isRefusal ? 'refusal' : 'error'}</Badge>
        {r.stage ? <Badge>{r.stage}</Badge> : null}
        {r.recipe?.narrationMode ? <Badge>{r.recipe.narrationMode}</Badge> : null}
        <Badge tone={r.recipe?.isNighttime ? 'red' : 'green'}>{r.recipe?.isNighttime ? 'nsfw' : 'sfw'}</Badge>
        {r.fellBackTo ? <Badge tone="green">→ {r.fellBackTo}</Badge> : null}
        <Text className="ml-auto text-[12px] text-white/40">{fmtWhen(tsToDate(r.createdAt))}</Text>
      </View>

      {r.recipe?.setting || r.recipe?.prompt ? (
        <Text className="mt-2 text-[13px] text-white/80">{r.recipe?.prompt || r.recipe?.setting}</Text>
      ) : null}
      {r.reason ? <Text className="mt-1 text-[12px] text-red-300/80">{r.reason}</Text> : null}

      <Pressable onPress={() => setOpen((v) => !v)} className="mt-2 self-start">
        <Text className="text-[12px] text-white/50 underline">{open ? 'hide prompt' : 'show the prompt fable saw'}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-2">
          {r.systemPrompt ? (
            <View className="rounded-lg border border-white/10 bg-black p-3">
              <Text className="mb-1 text-[11px] uppercase text-white/30">system</Text>
              <Text style={{ fontFamily: MONO }} className="text-[12px] text-white/70">{r.systemPrompt}</Text>
            </View>
          ) : null}
          {r.userPrompt ? (
            <View className="rounded-lg border border-white/10 bg-black p-3">
              <Text className="mb-1 text-[11px] uppercase text-white/30">user</Text>
              <Text style={{ fontFamily: MONO }} className="text-[12px] text-white/70">{r.userPrompt}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function StoryCard({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-[13px] font-medium text-white">{s.title || s.id}</Text>
        {s.narrationMode ? <Badge>{s.narrationMode}</Badge> : null}
        <Badge tone={s.isNighttime ? 'red' : 'green'}>{s.isNighttime ? 'nsfw' : 'sfw'}</Badge>
        {s.duration ? <Badge>{s.duration}</Badge> : null}
        <Text className="ml-auto text-[12px] text-white/40">{fmtWhen(tsToDate(s.createdAt))}</Text>
      </View>
      {s.setting || s.prompt ? (
        <Text className="mt-1 text-[12px] text-white/50" numberOfLines={1}>
          {s.prompt || s.setting}
        </Text>
      ) : null}
      {s.transcript ? (
        <>
          <Pressable onPress={() => setOpen((v) => !v)} className="mt-2 self-start">
            <Text className="text-[12px] text-white/50 underline">{open ? 'hide transcript' : 'show transcript'}</Text>
          </Pressable>
          {open ? (
            <View className="mt-2 rounded-lg border border-white/10 bg-black p-3">
              <Text className="text-[12px] leading-5 text-white/70">{s.transcript}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/* ─────────────────────────── route entry ─────────────────────────── */

export default function AdminScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(UNLOCK_KEY).then((v) => {
      if (v === '1') setUnlocked(true);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (!unlocked) {
    return (
      <CodeGate
        onUnlock={() => {
          setUnlocked(true);
          AsyncStorage.setItem(UNLOCK_KEY, '1');
        }}
      />
    );
  }
  return (
    <Dashboard
      onLock={() => {
        setUnlocked(false);
        AsyncStorage.removeItem(UNLOCK_KEY);
      }}
    />
  );
}
