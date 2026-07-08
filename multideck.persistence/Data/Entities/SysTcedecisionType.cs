using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcedecisionType
{
    public string TcedecisionTypeCode { get; set; } = null!;

    public string TcedecisionTypeName { get; set; } = null!;

    public string? TcedecisionTypeDescription { get; set; }

    public bool TcedecisionTypeIsBlocking { get; set; }

    public bool TcedecisionTypeIsActive { get; set; }

    public int TcedecisionTypeSortOrder { get; set; }

    public virtual ICollection<TceCaseDecision> TceCaseDecisions { get; set; } = new List<TceCaseDecision>();
}
