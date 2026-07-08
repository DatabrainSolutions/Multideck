using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceCaseQueue
{
    public Guid? TcecaseId { get; set; }

    public string? TcecaseNumber { get; set; }

    public string? TcecaseStatusCode { get; set; }

    public string? TcecaseStatusName { get; set; }

    public bool? TcecaseStatusIsBlocking { get; set; }

    public string? TcecaseRiskLevelCode { get; set; }

    public Guid? TcecaseRunId { get; set; }

    public string? TcerunNumber { get; set; }

    public Guid? TcecaseSubjectId { get; set; }

    public string? TcesubjectRoleCode { get; set; }

    public string? TcesubjectName { get; set; }

    public Guid? TcecaseJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TcecaseCustomerOrgId { get; set; }

    public string? TcecaseCustomerName { get; set; }

    public string? TcecaseTitle { get; set; }

    public Guid? TcecaseAssignedUserId { get; set; }

    public DateTime? TcecaseDueAt { get; set; }

    public DateTime? TcecaseCreatedAt { get; set; }

    public int? TcecaseMatchCount { get; set; }
}
