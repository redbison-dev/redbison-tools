import java.util.*;
import java.util.concurrent.*;
/** Holds about N MB of live, realistic-ish data: session maps with string fields and random payloads. */
public class BigHeap {
    record Session(String id, String user, String token, Map<String, String> attrs, byte[] payload) {}
    static final Map<String, Session> SESSIONS = new ConcurrentHashMap<>();
    public static void main(String[] a) throws Exception {
        int mb = Integer.parseInt(a[0]);
        Random r = new Random(42);
        long bytes = 0; int i = 0;
        while (bytes < (long) mb * 1024 * 1024) {
            Map<String, String> attrs = new HashMap<>();
            for (int k = 0; k < 4; k++) attrs.put("k" + k, "value-" + r.nextInt(1_000_000));
            byte[] p = new byte[2048];
            for (int j = 0; j < p.length; j += 8) { long v = r.nextLong(); for (int b = 0; b < 8; b++) p[j + b] = (byte) (b < 4 ? v >>> (b * 8) : 0); }
            String id = "sess-" + i;
            SESSIONS.put(id, new Session(id, "user" + (i % 5000) + "@example.com", UUID.randomUUID().toString(), attrs, p));
            bytes += 2048 + 600; i++;
        }
        System.out.println("ready " + SESSIONS.size());
        while (true) { byte[] g = new byte[64 * 1024]; g[1] = 2; Thread.sleep(5); }
    }
}
