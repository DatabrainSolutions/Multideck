using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocdateTimeStorageKind
{
    public string LocdtstorageKindCode { get; set; } = null!;

    public string LocdtstorageKindName { get; set; } = null!;

    public string? LocdtstorageKindDescription { get; set; }

    public bool LocdtstorageKindIsActive { get; set; }

    public int LocdtstorageKindSortOrder { get; set; }

    public virtual ICollection<LocDateTimeFieldRule> LocDateTimeFieldRules { get; set; } = new List<LocDateTimeFieldRule>();
}
