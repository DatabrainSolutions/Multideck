using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceIntegrationEventQueue
{
    public Guid? TceeventId { get; set; }

    public string? TceeventStatusCode { get; set; }

    public string? TceeventStatusName { get; set; }

    public string? TceeventTouchpointTypeCode { get; set; }

    public Guid? TceeventPolicyId { get; set; }

    public Guid? TceeventJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TceeventCustomerOrgId { get; set; }

    public string? TceeventCustomerName { get; set; }

    public Guid? TceeventOrgOfficeId { get; set; }

    public string? TceeventSourceRecordTypeCode { get; set; }

    public string? TceeventSourceTable { get; set; }

    public Guid? TceeventSourceId { get; set; }

    public string? TceeventEventKey { get; set; }

    public int? TceeventRetryCount { get; set; }

    public DateTime? TceeventNextAttemptAt { get; set; }

    public DateTime? TceeventProcessedAt { get; set; }

    public DateTime? TceeventCreatedAt { get; set; }
}
