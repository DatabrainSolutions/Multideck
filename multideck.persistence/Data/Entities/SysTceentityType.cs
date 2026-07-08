using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceentityType
{
    public string TceentityTypeCode { get; set; } = null!;

    public string TceentityTypeName { get; set; } = null!;

    public string? TceentityTypeDescription { get; set; }

    public bool TceentityTypeIsActive { get; set; }

    public int TceentityTypeSortOrder { get; set; }

    public virtual ICollection<TceScreeningSubject> TceScreeningSubjects { get; set; } = new List<TceScreeningSubject>();

    public virtual ICollection<TceWatchlistEntry> TceWatchlistEntries { get; set; } = new List<TceWatchlistEntry>();
}
