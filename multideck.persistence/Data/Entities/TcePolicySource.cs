using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TcePolicySource
{
    public Guid TcepolicySourceId { get; set; }

    public Guid TcepolicySourcePolicyId { get; set; }

    public Guid TcepolicySourceSourceId { get; set; }

    public bool TcepolicySourceIsMandatory { get; set; }

    public decimal? TcepolicySourceMinReviewScoreOverride { get; set; }

    public decimal? TcepolicySourceMinBlockScoreOverride { get; set; }

    public DateTime TcepolicySourceCreatedAt { get; set; }

    public virtual TceScreeningPolicy TcepolicySourcePolicy { get; set; } = null!;

    public virtual TceDataSource TcepolicySourceSource { get; set; } = null!;
}
