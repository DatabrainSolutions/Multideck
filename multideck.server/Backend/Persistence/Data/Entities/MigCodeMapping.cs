using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigCodeMapping
{
    public Guid MigcodeMapId { get; set; }

    public string? MigcodeMapEntityTypeCode { get; set; }

    public string MigcodeMapSourceCodeSet { get; set; } = null!;

    public string MigcodeMapSourceCode { get; set; } = null!;

    public string? MigcodeMapTargetTable { get; set; }

    public string? MigcodeMapTargetFieldName { get; set; }

    public string MigcodeMapTargetCode { get; set; } = null!;

    public decimal? MigcodeMapConfidence { get; set; }

    public bool MigcodeMapIsApproved { get; set; }

    public Guid? MigcodeMapApprovedBy { get; set; }

    public DateTime? MigcodeMapApprovedAt { get; set; }

    public virtual CmpUser? MigcodeMapApprovedByNavigation { get; set; }

    public virtual SysMigentityType? MigcodeMapEntityTypeCodeNavigation { get; set; }
}
