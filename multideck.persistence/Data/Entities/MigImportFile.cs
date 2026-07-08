using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigImportFile
{
    public Guid MigfileId { get; set; }

    public Guid MigfileBatchId { get; set; }

    public string MigfileFileName { get; set; } = null!;

    public string? MigfileFileType { get; set; }

    public string? MigfileFileHashSha256 { get; set; }

    public string? MigfileStorageRef { get; set; }

    public int MigfileRowCount { get; set; }

    public DateTime MigfileReceivedAt { get; set; }

    public virtual ICollection<MigImportRow> MigImportRows { get; set; } = new List<MigImportRow>();

    public virtual MigImportBatch MigfileBatch { get; set; } = null!;
}
