import pandas as pd
import glob

files = glob.glob("data/transcript-s*e*.csv")

dfs = []

for f in files:
    df = pd.read_csv(f)
    dfs.append(df)

master = pd.concat(dfs, ignore_index=True)

master.to_csv("data/master_all_seasons.csv", index=False)

print(master.shape)