using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigLoadResult
{
    public Guid MigloadId { get; set; }

    public Guid MigloadRunId { get; set; }

    public Guid? MigloadRowId { get; set; }

    public string MigloadTargetTable { get; set; } = null!;

    public Guid? MigloadTargetId { get; set; }

    public string MigloadActionCode { get; set; } = null!;

    public string MigloadStatusCode { get; set; } = null!;

    public string? MigloadMessage { get; set; }

    public DateTime MigloadCreatedAt { get; set; }

    public virtual MigImportRow? MigloadRow { get; set; }

    public virtual MigImportRun MigloadRun { get; set; } = null!;

    public virtual SysObsrunStatus MigloadStatusCodeNavigation { get; set; } = null!;
}
