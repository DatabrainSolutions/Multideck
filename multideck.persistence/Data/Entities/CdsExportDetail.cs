using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsExportDetail
{
    public Guid CdsexId { get; set; }

    public Guid CdsexCdsid { get; set; }

    public string? CdsexExportType { get; set; }

    public string? CdsexDucr { get; set; }

    public string? CdsexMucr { get; set; }

    public string? CdsexGoodsLocationCode { get; set; }

    public string? CdsexOfficeOfExportCode { get; set; }

    public string? CdsexOfficeOfExitCode { get; set; }

    public bool CdsexPreLodgedIndicator { get; set; }

    public bool CdsexArrivedIndicator { get; set; }

    public bool CdsexSafetyAndSecurityIndicator { get; set; }

    public string? CdsexExitResultCode { get; set; }

    public string CdsexExportSpecificJson { get; set; } = null!;

    public DateTime CdsexCreatedAt { get; set; }

    public virtual CdsDeclaration CdsexCds { get; set; } = null!;
}
