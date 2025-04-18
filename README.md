# redis-bloom
Bloom filter implementation that can be used in managed Redis services, such as AWS ElastiCache


## Dev Environment Setup

This guide assumes Mac/Linux environment.

1. Install `hermit`, a tool for bootstrapping platform/environment level dependencies such as `node`:

   `curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash`

   This will download and install hermit into ~/bin. You should add this to your `$PATH` if it isn’t already:

   For Zsh (macOS):

   ```
     echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
     source ~/.zshrc
   ```

   For Bash (Linux):

   ```
     echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
     source ~/.bashrc
   ```
   
   See `https://cashapp.github.io/hermit/` if you want to learn more.

1. Activate `hermit` (always run this command first when you start your IDE or command prompt):
   `. ./bin/activate-hermit`

1. Now you can install the dev environment dependencies using `hermit`:

   `hermit install`