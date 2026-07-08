using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxConflictSummary
{
    public Guid? MdxconflictId { get; set; }

    public Guid? MdxconflictSharedJobId { get; set; }

    public string? MdxsharedJobLocalJobNumberSnapshot { get; set; }

    public string? MdxsharedJobRemoteJobNumber { get; set; }

    public string? MdxconflictPeerName { get; set; }

    public string? MdxconflictStatusCode { get; set; }

    public string? MdxconflictDataScopeCode { get; set; }

    public string? MdxconflictFieldPath { get; set; }

    public string? MdxconflictTitle { get; set; }

    public Guid? MdxconflictAssignedUserId { get; set; }

    public string? MdxconflictAssignedUserEmail { get; set; }

    public DateTime? MdxconflictResolvedAt { get; set; }

    public DateTime? MdxconflictCreatedAt { get; set; }
}
