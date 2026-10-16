import sys
import time
import re
import random
import chess
import chess.engine
from playwright.sync_api import sync_playwright

def clean_san(text):
    if not text:
        return ""
    text = re.sub(r'[\?!#\+]+', '', text.strip())
    text = re.sub(r'^\d+\.+\s*', '', text)
    return text.strip()

def get_coords(sq, orientation, bounds):
    file_idx = ord(sq[0]) - ord('a')
    rank_idx = int(sq[1]) - 1
    
    if orientation == 'white':
        col = file_idx
        row = 7 - rank_idx
    else:
        col = 7 - file_idx
        row = rank_idx
        
    sq_size = bounds['width'] / 8.0
    x = (col + 0.5) * sq_size
    y = (row + 0.5) * sq_size
    return x, y

def play_game(input_url):
    print(f"[*] Starting Playwright for URL: {input_url}", flush=True)
    
    m = re.search(r'lichess\.org/([a-zA-Z0-9]{8})', input_url)
    if not m:
        print("[!] Invalid Lichess URL", flush=True)
        return
    game_id = m.group(1)
    print(f"[*] Game ID: {game_id}", flush=True)
    
    # Configure Stockfish at maximum Grandmaster tactical sharpness
    engine_path = '/opt/homebrew/bin/stockfish'
    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    engine.configure({"Threads": 4, "Hash": 128, "Skill Level": 20})
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir='/tmp/chess_bot_profile',
            headless=False,
            args=['--disable-blink-features=AutomationControlled', '--start-maximized'],
            no_viewport=True
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(input_url)
        
        print("[*] Page loaded. Checking for Join button...", flush=True)
        time.sleep(1.5)
        
        join_btn = page.locator('button:has-text("JOIN THE GAME"), a:has-text("JOIN THE GAME"), button:has-text("Join the game"), a:has-text("Join the game"), .join, .fbt:has-text("Join")')
        if join_btn.count() > 0 and join_btn.first.is_visible():
            print("[+] Clicking 'Join the game' button...", flush=True)
            join_btn.first.click()
            time.sleep(1.5)
            
        print("[*] Waiting for chessboard to appear...", flush=True)
        page.wait_for_selector('cg-board', timeout=600000)
        
        # Detect board orientation
        orientation = 'white'
        for _ in range(20):
            orient_val = page.evaluate('''() => {
                const wrap = document.querySelector('.cg-wrap') || document.querySelector('cg-board')?.parentElement;
                if (!wrap) return null;
                if (wrap.classList.contains('orientation-black')) return 'black';
                if (wrap.classList.contains('orientation-white')) return 'white';
                return null;
            }''')
            if orient_val:
                orientation = orient_val
                break
            time.sleep(0.3)
            
        our_color = chess.WHITE if orientation == 'white' else chess.BLACK
        print(f"[+] Active! Orientation: {orientation.upper()} (Playing as: {'White' if our_color == chess.WHITE else 'Black'})", flush=True)
        print("[*] Mode: Grandmaster Aggressive & Snappy (1.2 - 2.2s quick pace).", flush=True)
        
        last_played_ply = -1
        print("[*] Real-time bot loop running! Watching board...", flush=True)
        
        while True:
            try:
                dom_moves_raw = page.evaluate('''() => {
                    const elements = Array.from(document.querySelectorAll('u8t, move, l4x, kwdb, z7yx, .rmoves *'));
                    return elements.map(e => e.innerText?.trim()).filter(Boolean);
                }''')
                
                status_info = page.evaluate('''() => {
                    const el = document.querySelector('.status, .result-wrap, .analyse__status, .game__meta__infos');
                    const text = el ? el.innerText.trim() : '';
                    const isOver = /checkmate|resigned|draw|stalemate|victorious|time out|abandoned|won|lost/i.test(text);
                    return { text, isOver };
                }''')
                
                temp_board = chess.Board()
                for m in dom_moves_raw:
                    clean = clean_san(m)
                    if not clean:
                        continue
                    try:
                        temp_board.push_san(clean)
                    except Exception:
                        pass
                
                board = temp_board
                current_ply = len(board.move_stack)
                
                if status_info['isOver'] and current_ply > 0:
                    print(f"\n[!] Game Over: {status_info['text']}", flush=True)
                    time.sleep(5)
                    break
                    
                if board.turn == our_color and current_ply > last_played_ply:
                    print(f"\n[>] OUR TURN! Move #{board.fullmove_number} ({orientation})", flush=True)
                    print(f"    FEN: {board.fen()}", flush=True)
                    print(f"    Current moves: {[m.uci() for m in board.move_stack]}", flush=True)
                    
                    # Snappy thinking time: 1.2 to 2.2 seconds
                    fast_delay = random.uniform(1.2, 2.2)
                    print(f"[*] Quick tactical calculation ({fast_delay:.1f}s)...", flush=True)
                    time.sleep(fast_delay)
                    
                    # Stockfish depth 18 for decisive GM conversion
                    engine_result = engine.play(board, chess.engine.Limit(time=0.5, depth=18))
                    best_move = engine_result.move
                    
                    if not best_move:
                        time.sleep(0.2)
                        continue
                        
                    best_move_uci = best_move.uci()
                    from_sq = best_move_uci[:2]
                    to_sq = best_move_uci[2:4]
                    promo = best_move_uci[4:] if len(best_move_uci) > 4 else None
                    
                    san_move = board.san(best_move)
                    print(f"[+] Playing: {best_move_uci} ({san_move})", flush=True)
                    
                    board_el = page.locator('cg-board')
                    bounds = board_el.bounding_box()
                    
                    x1, y1 = get_coords(from_sq, orientation, bounds)
                    x2, y2 = get_coords(to_sq, orientation, bounds)
                    
                    board_el.click(position={'x': x1, 'y': y1})
                    time.sleep(random.uniform(0.12, 0.22))
                    board_el.click(position={'x': x2, 'y': y2})
                    time.sleep(0.15)
                    
                    if promo:
                        page.wait_for_timeout(200)
                        queen_promo = page.locator('#promotion-choice piece.queen, .promotion-choice piece.queen')
                        if queen_promo.is_visible():
                            queen_promo.click()
                            
                    last_played_ply = current_ply
                    time.sleep(0.2)
                else:
                    time.sleep(0.2)
                    
            except KeyboardInterrupt:
                print("\n[*] Stopped.", flush=True)
                break
            except Exception as e:
                time.sleep(0.2)
                
        engine.quit()
        context.close()
        print("[*] Game finished.", flush=True)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 play_chess.py <lichess_url>")
        sys.exit(1)
    play_game(sys.argv[1])
