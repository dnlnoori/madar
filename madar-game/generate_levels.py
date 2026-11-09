import random, json, time
from functools import lru_cache


def patterns(n):
    out=[]
    for x in range(1<<n):
        row=tuple((x>>i)&1 for i in range(n))
        if sum(row)==n//2 and all(not(row[i]==row[i+1]==row[i+2]) for i in range(n-2)):
            out.append(row)
    return out


def generate_solution(n, rng):
    pats=patterns(n)
    rows=[]
    col_counts=[0]*n
    def rec():
        r=len(rows)
        if r==n:
            if any(c != n//2 for c in col_counts): return False
            cols=[tuple(rows[i][j] for i in range(n)) for j in range(n)]
            return len(set(cols))==n
        candidates=pats[:]
        rng.shuffle(candidates)
        for p in candidates:
            if p in rows: continue
            ok=True
            for c,v in enumerate(p):
                if col_counts[c]+v > n//2: ok=False; break
                if r>=2 and rows[-1][c]==rows[-2][c]==v: ok=False; break
            if not ok: continue
            # If this row makes two completed columns identical so far, reject only if already impossible to distinguish.
            rows.append(p)
            for c,v in enumerate(p): col_counts[c]+=v
            if rec(): return True
            for c,v in enumerate(p): col_counts[c]-=v
            rows.pop()
        return False
    if not rec():
        raise RuntimeError(f'Could not generate {n}x{n} solution')
    return [list(r) for r in rows]


def count_solutions(n, givens, constraints, limit=2):
    board=[row[:] for row in givens]
    cons=[]
    for e in constraints:
        a=e['a'][0]*n+e['a'][1]; b=e['b'][0]*n+e['b'][1]
        cons.append((a,b,0 if e['type']=='same' else 1))
    adj=[[] for _ in range(n*n)]
    for a,b,rel in cons:
        adj[a].append((b,rel)); adj[b].append((a,rel))
    flat=[board[r][c] for r in range(n) for c in range(n)]
    row_vals=[[flat[r*n+c] for c in range(n)] for r in range(n)]
    col_vals=[[flat[r*n+c] for r in range(n)] for c in range(n)]
    solutions=0

    def partial_ok(idx, val):
        r,c=divmod(idx,n)
        # Row and column counts, triples, and completed uniqueness.
        for arr in (row_vals[r], col_vals[c]):
            z=arr[:]
            pos=c if arr is row_vals[r] else r
            z[pos]=val
            if z.count(0)>n//2 or z.count(1)>n//2: return False
            for k in range(n-2):
                if z[k] != -1 and z[k]==z[k+1]==z[k+2]: return False
        # Relation constraints.
        for other,rel in adj[idx]:
            ov=flat[other]
            if ov!=-1 and ((val==ov) != (rel==0)): return False
        # If a row/column is complete, it must not duplicate another complete one.
        if -1 not in row_vals[r]:
            for rr in range(n):
                if rr!=r and -1 not in row_vals[rr] and row_vals[rr]==row_vals[r]: return False
        if -1 not in col_vals[c]:
            cv=[col_vals[c][i] for i in range(n)]
            for cc in range(n):
                if cc!=c and -1 not in col_vals[cc] and col_vals[cc]==cv: return False
        return True

    def choose_cell():
        best=None; bestdom=None
        for idx,v in enumerate(flat):
            if v!=-1: continue
            dom=[]
            for val in (0,1):
                if partial_ok(idx,val): dom.append(val)
            if not dom: return idx, []
            if best is None or len(dom)<len(bestdom):
                best,bestdom=idx,dom
                if len(dom)==1: break
        return best,bestdom

    def dfs():
        nonlocal solutions
        if solutions>=limit: return
        idx,dom=choose_cell()
        if idx is None:
            # all row/col balanced and uniqueness guaranteed by incremental checks
            solutions+=1
            return
        if not dom: return
        r,c=divmod(idx,n)
        for val in dom:
            flat[idx]=val; row_vals[r][c]=val; col_vals[c][r]=val
            dfs()
            flat[idx]=-1; row_vals[r][c]=-1; col_vals[c][r]=-1
            if solutions>=limit: return
    # Validate givens themselves before search.
    for idx,v in enumerate(flat):
        if v!=-1:
            r,c=divmod(idx,n)
            flat[idx]=-1; row_vals[r][c]=-1; col_vals[c][r]=-1
            ok=partial_ok(idx,v)
            flat[idx]=v; row_vals[r][c]=v; col_vals[c][r]=v
            if not ok: return 0
    dfs()
    return solutions


def make_constraints(solution, n, count, rng):
    edges=[]
    for r in range(n):
        for c in range(n):
            if c+1<n: edges.append((r,c,r,c+1))
            if r+1<n: edges.append((r,c,r+1,c))
    rng.shuffle(edges)
    used=set(); out=[]
    for r1,c1,r2,c2 in edges:
        if len(out)>=count: break
        key=tuple(sorted((r1*n+c1,r2*n+c2)))
        if key in used: continue
        used.add(key)
        same=solution[r1][c1]==solution[r2][c2]
        out.append({'a':[r1,c1],'b':[r2,c2],'type':'same' if same else 'different'})
    return out


def build_puzzle(n, level, rng):
    sol=generate_solution(n,rng)
    if level<=10: constraint_target=0; clue_target=0.72
    elif level<=25: constraint_target=2; clue_target=0.60
    elif level<=45: constraint_target=4; clue_target=0.50
    elif level<=65: constraint_target=7; clue_target=0.43
    elif level<=80: constraint_target=10; clue_target=0.40
    else: constraint_target=14; clue_target=0.36
    constraints=make_constraints(sol,n,constraint_target,rng)
    givens=[[-1]*n for _ in range(n)]
    order=[(r,c) for r in range(n) for c in range(n)]
    rng.shuffle(order)
    # Begin with all clues, then remove while uniqueness remains. Keep a target minimum as a difficulty guard.
    for r in range(n):
        for c in range(n): givens[r][c]=sol[r][c]
    target=max(4, round(n*n*clue_target))
    for r,c in order:
        if sum(v!=-1 for row in givens for v in row) <= target: break
        old=givens[r][c]; givens[r][c]=-1
        if count_solutions(n,givens,constraints,2)!=1:
            givens[r][c]=old
    # A final guaranteed uniqueness check; if constraints/givens are too weak, restore clues.
    if count_solutions(n,givens,constraints,2)!=1:
        for r,c in order:
            if givens[r][c]==-1:
                givens[r][c]=sol[r][c]
                if count_solutions(n,givens,constraints,2)==1: break
    assert count_solutions(n,givens,constraints,2)==1
    return {'id':level,'title': ['طلوع','سپیده‌دم','مدار روشن','کسوف','نیمه تاریک','فراتر از مدار'][0 if level<=10 else 1 if level<=25 else 2 if level<=45 else 3 if level<=65 else 4 if level<=80 else 5],
            'gridSize':n,'difficulty':'easy' if level<=25 else 'medium' if level<=45 else 'hard' if level<=65 else 'expert' if level<=80 else 'master',
            'initialBoard':givens,'constraints':constraints,'solution':sol,'hints':[],'isPublished':True}


def main():
    start=time.time(); levels=[]
    for level in range(1,101):
        n=4 if level<=10 else 6 if level<=80 else 8
        rng=random.Random(84000+level*7919)
        item=build_puzzle(n,level,rng)
        levels.append(item)
        if level%10==0:
            clues=sum(v!=-1 for row in item['initialBoard'] for v in row)
            print(f'level {level}: {n}x{n}, clues={clues}, constraints={len(item["constraints"])}, elapsed={time.time()-start:.1f}s')
    with open('/mnt/data/madar-game/src/data/levels.json','w',encoding='utf-8') as f:
        json.dump(levels,f,ensure_ascii=False,separators=(',',':'))
    print('done',len(levels),'seconds',time.time()-start)

if __name__=='__main__': main()
