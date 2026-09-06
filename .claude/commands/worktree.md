---
description: Crea un git worktree aislado en .trees/<nombre> y ejecuta ahí las instrucciones indicadas
argument-hint: <descripción del trabajo a realizar en el worktree>
allowed-tools: Bash(git worktree add:*), Bash(git worktree list:*), Bash(git branch:*), Bash(git status:*), Read, Write, Edit, Glob, Grep
---

## Contexto

- Worktrees existentes: !`git worktree list`
- Rama actual: !`git branch --show-current`

## Tu tarea

El usuario ha invocado `/worktree` con estas instrucciones:

<instrucciones>
$ARGUMENTS
</instrucciones>

Sigue estos pasos:

1. **Determina un nombre** corto en kebab-case que resuma el requerimiento de las
   instrucciones (p. ej. `fix-game-over`, `nueva-pieza-rayo`, `refactor-scoring`).
   Úsalo como `<nombre>` en los pasos siguientes.

2. **Crea el worktree** con una rama nueva basada en `main`:

   ```bash
   git worktree add -b <nombre> .trees/<nombre> main
   ```

   Si la rama ya existe, omite `-b`. Si `.trees/<nombre>` ya existe, elige otro
   nombre (por ejemplo añadiendo un sufijo `-2`).

3. **Trabaja exclusivamente dentro de `.trees/<nombre>/`.** Todas las rutas de
   lectura y escritura deben apuntar a ese directorio; no modifiques ningún
   archivo del árbol de trabajo principal. Este trabajo queda aislado del código
   principal.

4. **Ejecuta las instrucciones** `<instrucciones>` sobre los archivos del
   worktree. Al terminar, resume qué cambiaste y en qué ruta/rama quedó, e indica
   que el usuario puede revisar el worktree y luego hacer merge o eliminarlo con
   `git worktree remove .trees/<nombre>`.

No hagas commit ni push salvo que las instrucciones lo pidan explícitamente.
