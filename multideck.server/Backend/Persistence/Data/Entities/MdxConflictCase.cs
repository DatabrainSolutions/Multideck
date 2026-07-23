using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxConflictCase
{
    public Guid MdxconflictId { get; set; }

    public Guid MdxconflictSharedJobId { get; set; }

    public Guid? MdxconflictEventId { get; set; }

    public string MdxconflictStatusCode { get; set; } = null!;

    public string MdxconflictDataScopeCode { get; set; } = null!;

    public string? MdxconflictFieldPath { get; set; }

    public string MdxconflictLocalValueJson { get; set; } = null!;

    public string MdxconflictRemoteValueJson { get; set; } = null!;

    public string? MdxconflictResolvedValueJson { get; set; }

    public string MdxconflictTitle { get; set; } = null!;

    public string? MdxconflictDescription { get; set; }

    public Guid? MdxconflictAssignedUserId { get; set; }

    public DateTime? MdxconflictResolvedAt { get; set; }

    public Guid? MdxconflictResolvedBy { get; set; }

    public DateTime MdxconflictCreatedAt { get; set; }

    public virtual CmpUser? MdxconflictAssignedUser { get; set; }

    public virtual SysMdxdataScope MdxconflictDataScopeCodeNavigation { get; set; } = null!;

    public virtual MdxDataChangeEvent? MdxconflictEvent { get; set; }

    public virtual CmpUser? MdxconflictResolvedByNavigation { get; set; }

    public virtual MdxSharedJob MdxconflictSharedJob { get; set; } = null!;

    public virtual SysMdxconflictStatus MdxconflictStatusCodeNavigation { get; set; } = null!;
}
