// GraphQL schema for NIMBUS People Cloud.
//
// The product UI only ever uses: login, me, myPayslips, myLeaveRequests,
// myTeam (manager chain) and requestLeave. Everything else below
// (employee, payslipsFor, the salary/confidentialMemo/vaultSecret/
// passwordHash fields) is reachable through the API and discoverable via
// introspection, but is never called by the front end.

export const typeDefs = /* GraphQL */ `
  enum Role {
    EMPLOYEE
    MANAGER
    ADMIN
    EXECUTIVE
  }

  enum LeaveKind {
    ANNUAL
    SICK
    UNPAID
  }

  enum LeaveStatus {
    PENDING
    APPROVED
    REJECTED
  }

  type Department {
    id: ID!
    name: String!
    costCenter: String!
  }

  type Payslip {
    id: ID!
    period: String!
    grossCents: Int!
    taxCents: Int!
    netCents: Int!
    issuedAt: String!
    employee: Employee
  }

  type LeaveRequest {
    id: ID!
    kind: LeaveKind!
    startDate: String!
    endDate: String!
    days: Float!
    status: LeaveStatus!
    reason: String
    createdAt: String!
  }

  type Employee {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
    title: String!
    role: Role!
    location: String!
    hiredAt: String!
    leaveBalance: Float!
    department: Department
    manager: Employee
    salary: Int
    passwordHash: String
    confidentialMemo: String
    vaultSecret: String
  }

  type AuthPayload {
    token: String!
    employee: Employee!
  }

  type Query {
    "The currently authenticated employee."
    me: Employee

    "Payslips belonging to the currently authenticated employee."
    myPayslips: [Payslip!]!

    "Leave requests filed by the currently authenticated employee."
    myLeaveRequests: [LeaveRequest!]!

    "The authenticated employee's management chain, closest manager first."
    myManagerChain: [Employee!]!

    employee(id: ID!): Employee

    payslipsFor(employeeId: ID!): [Payslip!]!

    departments: [Department!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!

    "File a leave request for the currently authenticated employee."
    requestLeave(
      kind: LeaveKind!
      startDate: String!
      endDate: String!
      days: Float!
      reason: String
    ): LeaveRequest!
  }
`;
