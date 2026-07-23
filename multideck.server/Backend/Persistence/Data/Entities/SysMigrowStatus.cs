using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMigrowStatus
{
    public string MigrowStatusCode { get; set; } = null!;

    public string MigrowStatusName { get; set; } = null!;

    public string? MigrowStatusDescription { get; set; }

    public bool MigrowStatusIsLoadable { get; set; }

    public bool MigrowStatusIsActive { get; set; }

    public int MigrowStatusSortOrder { get; set; }

    public virtual ICollection<MigImportRow> MigImportRows { get; set; } = new List<MigImportRow>();
}
