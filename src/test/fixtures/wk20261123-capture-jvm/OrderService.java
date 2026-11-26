import java.util.*;
import java.util.concurrent.*;

/** Small service-shaped workload: a growing cache, a worker pool, a lock holder. */
public class OrderService {
    static final Map<String, byte[]> CACHE = new ConcurrentHashMap<>();
    static final Object LEDGER = new Object();

    public static void main(String[] args) throws Exception {
        int perSecond = args.length > 0 ? Integer.parseInt(args[0]) : 200;
        ExecutorService pool = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r);
            t.setName("order-worker-" + t.getId());
            return t;
        });
        Thread holder = new Thread(() -> {
            synchronized (LEDGER) {
                try { Thread.sleep(Long.MAX_VALUE); } catch (InterruptedException e) { }
            }
        }, "ledger-writer");
        holder.setDaemon(true);
        holder.start();
        for (int i = 0; i < 4; i++) {
            pool.submit(() -> {
                synchronized (LEDGER) { System.out.println("never"); }
            });
        }
        long n = 0;
        while (true) {
            for (int i = 0; i < perSecond; i++) {
                CACHE.put("order-" + (n++), new byte[1024]);
                byte[] garbage = new byte[16 * 1024];
                garbage[0] = 1;
            }
            Thread.sleep(1000 / 10);
        }
    }
}
