using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceWatchlistAlias
{
    public Guid TcealiasId { get; set; }

    public Guid TcealiasEntryId { get; set; }

    public string TcealiasName { get; set; } = null!;

    public string? TcealiasNormalizedName { get; set; }

    public string? TcealiasLanguageCode { get; set; }

    public string? TcealiasAliasType { get; set; }

    public bool TcealiasIsStrongAlias { get; set; }

    public DateTime TcealiasCreatedAt { get; set; }

    public virtual TceWatchlistEntry TcealiasEntry { get; set; } = null!;
}
